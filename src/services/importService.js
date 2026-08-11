import Papa from 'papaparse';
import { 
  createCustomer, 
  createInvoice, 
  createInvoiceLine, 
  createPayment, 
  createProduct,
  getProducts,
  getProductByRef,
  validateInvoice,
  addSellingPrice,
  getAllInvoices
} from './api';
import api from './api';
// Importer le service de calcul des remises
import { calculateDiscount, createReglement, saveProductPrice } from './discountService';

// Gestion des remises calculées en mémoire
let calculatedDiscounts = [];

export const getCalculatedDiscounts = () => {
  return calculatedDiscounts;
};

export const clearCalculatedDiscounts = () => {
  calculatedDiscounts = [];
  return calculatedDiscounts;
};

// Fonction pour calculer une remise sans l'enregistrer
const calculateDiscountForPayment = async (invoiceDate, paymentDate, invoiceAmount, invoiceRef) => {
  try {
    // Convertir les dates JJ/MM/AAAA en format fiable (YYYY-MM-DD) avant de calculer l'écart
    const invoiceDateISO = formatDate(invoiceDate) || invoiceDate;
    const paymentDateISO = formatDate(paymentDate) || paymentDate;

    const invoice = new Date(invoiceDateISO);
    const payment = new Date(paymentDateISO);

    if (isNaN(invoice.getTime()) || isNaN(payment.getTime())) {
      throw new Error(`Date invalide (facture: ${invoiceDate}, paiement: ${paymentDate})`);
    }

    // Calculer le nombre de jours
    const diffTime = Math.abs(payment - invoice);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    // Appeler l'API de calcul
    const result = await calculateDiscount(diffDays);
    
    // Calculer les montants
    const discountAmount = invoiceAmount * (result.pourcentage / 100);
    const amountAfterDiscount = invoiceAmount - discountAmount;
    
    return {
      invoiceRef,
      invoiceDate,
      paymentDate,
      daysDiff: diffDays,
      pourcentage: result.pourcentage,
      label: result.label,
      originalAmount: invoiceAmount,
      discountAmount: discountAmount,
      amountAfterDiscount: amountAfterDiscount,
      ruleId: result.ruleId
    };
  } catch (error) {
    console.error('Erreur calcul remise:', error);
    return {
      invoiceRef,
      invoiceDate,
      paymentDate,
      daysDiff: 0,
      pourcentage: 0,
      label: 'Aucune remise',
      originalAmount: invoiceAmount,
      discountAmount: 0,
      amountAfterDiscount: invoiceAmount
    };
  }
};

// Parser les fichiers CSV
export const parseCSV = (file) => {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transform: (value, field) => {
        if (typeof value === 'string') {
          value = value.replace(/^["']|["']$/g, '');
          if (field === 'pu_hors_Taxe' || field === 'montant' || field === 'remise' || field === 'taxe') {
            value = value.replace(',', '.');
          }
        }
        return value;
      },
      complete: (result) => {
        resolve(result.data);
      },
      error: (error) => {
        reject(error);
      }
    });
  });
};

// Mapping caisse CSV -> accountid Dolibarr
export const getAccountId = (caisse) => {
  if (caisse === 'Banque1') return 1;
  if (caisse === 'Caisse1') return 2;
  return null;
};

// Mapping caisse CSV -> paymentid Dolibarr
export const getPaymentId = (caisse) => {
  if (caisse === 'Banque1') return 2; // Virement (VIR)
  if (caisse === 'Caisse1') return 4; // Espèces (LIQ)
  return null;
};

// Fonction utilitaire pour récupérer tous les produits
const getAllProducts = async () => {
  try {
    const response = await api.get('/products', { params: { limit: 1000 } });
    return Array.isArray(response.data) ? response.data : [];
  } catch (error) {
    console.error('Erreur getAllProducts:', error);
    return [];
  }
};

// Créer ou récupérer un produit
const getOrCreateProduct = async (ref_produit, produit, pu_hors_Taxe, taxe) => {
  try {
    let product = await getProductByRef(ref_produit);
    if (product) {
      console.log(`Produit existant: ${ref_produit} (ID: ${product.id})`);
      return product;
    }

    const price_ttc = parseFloat(pu_hors_Taxe) * (1 + parseFloat(taxe.replace('%', '')) / 100);
    
    const productData = {
      ref: ref_produit,
      label: produit,
      description: produit,
      status: 1,
      type: 0,
      price: parseFloat(pu_hors_Taxe),
      price_ttc: price_ttc
    };
    
    console.log(`Création produit ${ref_produit}:`, productData);
    await createProduct(productData);

    await new Promise(resolve => setTimeout(resolve, 500));

    product = await getProductByRef(ref_produit);
    if (!product) {
      const allProducts = await getAllProducts();
      product = allProducts.find(p => p.ref === ref_produit);
      
      if (!product) {
        throw new Error(`Impossible de trouver le produit ${ref_produit} après création`);
      }
    }
    
    console.log(`Produit créé/récupéré: ${ref_produit} (ID: ${product.id})`);
    return product;
    
  } catch (error) {
    console.error(`Erreur création produit ${ref_produit}:`, error);
    throw error;
  }
};

// Traiter les données importées - VERSION AVEC CALCUL DES REMISES
export const processImportedData = async (factures, details, paiements) => {
  const results = {
    success: 0,
    errors: 0,
    errorDetails: [],
    products: {
      created: 0,
      existing: 0
    }
  };

  // Réinitialiser les remises calculées
  calculatedDiscounts = [];

  try {
    // 0. CRÉATION DES PRODUITS
    const productMap = new Map();
    
    // Regrouper tous les prix distincts par produit (au lieu de n'en garder qu'un)
    const productPricesMap = new Map(); // ref_produit -> [{produit, pu_hors_Taxe, taxe}, ...]

    for (const detail of details) {
      const key = detail.ref_produit;
      if (!productPricesMap.has(key)) {
        productPricesMap.set(key, []);
      }
      const prices = productPricesMap.get(key);
      const puNum = parseFloat(detail.pu_hors_Taxe);
      if (!prices.some(p => parseFloat(p.pu_hors_Taxe) === puNum)) {
        prices.push({
          produit: detail.produit,
          pu_hors_Taxe: detail.pu_hors_Taxe,
          taxe: detail.taxe
        });
      }
    }

    console.log(`${productPricesMap.size} produit(s) unique(s) à importer`);

    for (const [ref, priceList] of productPricesMap) {
      try {
        // Le 1er prix sert à créer/retrouver le produit (prix de base)
        const basePrice = priceList[0];
        const product = await getOrCreateProduct(ref, basePrice.produit, basePrice.pu_hors_Taxe, basePrice.taxe);
        productMap.set(ref, product);
        results.products.created++;
        results.success++;

        // Les prix suivants deviennent des niveaux de multiprix (2, 3, ...)
        // Historiser TOUS les prix rencontrés (y compris le premier) dans notre propre backend,
        for (const p of priceList) {
          try {
            await saveProductPrice({
              ref_produit: ref,
              pu_ht: parseFloat(p.pu_hors_Taxe),
              taxe: parseFloat((p.taxe || '0').replace('%', ''))
            });
          } catch (priceError) {
            console.error(`Erreur historisation prix ${ref}:`, priceError.message);
          }
        }
      } catch (error) {
        results.errors++;
        results.errorDetails.push(`Erreur produit ${ref}: ${error.message}`);
      }
    }

    // 1. Créer les clients
    const clientsMap = new Map();
    for (const facture of factures) {
      if (!clientsMap.has(facture.code_client)) {
        try {
          const clientData = {
            name: facture.nom_client,
            code_client: facture.code_client,
            client: 1,
            status: 1
          };
          const client = await createCustomer(clientData);
          console.log(`[Client ${facture.code_client}] Créé (ID: ${client})`);
          clientsMap.set(facture.code_client, client);
          results.success++;
        } catch (error) {
          results.errors++;
          results.errorDetails.push(`Erreur client ${facture.code_client}: ${error.message}`);
        }
      }
    }

    // 2. Créer les factures
    const facturesMap = new Map();
    for (const facture of factures) {
      const socid = clientsMap.get(facture.code_client);
      if (!socid) {
        results.errors++;
        results.errorDetails.push(`Facture ${facture.num_facture} ignorée : client non créé`);
        continue;
      }
      try {
        const invoiceData = {
          ref: facture.num_facture,
          ref_client: facture.num_facture,
          date: formatDate(facture.date_facture),
          date_lim_reglement: facture.date_limite_reglement ? formatDate(facture.date_limite_reglement) : null,
          socid,
          type: 0
        };
        const invoice = await createInvoice(invoiceData);
        console.log(`[Facture ${facture.num_facture}] Créée (ID: ${invoice})`);
        facturesMap.set(facture.num_facture, invoice);
        results.success++;
      } catch (error) {
        results.errors++;
        results.errorDetails.push(`Erreur facture ${facture.num_facture}: ${error.message}`);
      }
    }

    // 3. Créer les lignes de facture
    const totalTTCParFacture = new Map();

    for (const detail of details) {
      try {
        const invoiceId = facturesMap.get(detail.num_facture);
        if (!invoiceId) {
          results.errors++;
          results.errorDetails.push(`Ligne ${detail.ref_detail}: Facture ${detail.num_facture} non trouvée`);
          continue;
        }

        const qty = parseFloat(detail.quantite);
        const subprice = parseFloat(detail.pu_hors_Taxe);
        const remise = detail.remise ? parseFloat(detail.remise.replace('%', '')) : 0;
        const tva = detail.taxe ? parseFloat(detail.taxe.replace('%', '')) : 0;

        const product = productMap.get(detail.ref_produit);
        const fk_product = product ? product.id : null;

        const lineData = {
          desc: detail.produit,
          qty,
          subprice,
          remise_percent: remise,
          tva_tx: tva,
          ref: detail.ref_produit,
          fk_product: fk_product
        };
        
        console.log(`Ligne ${detail.ref_detail}:`, {
          produit: detail.produit,
          fk_product,
          qty,
          subprice
        });
        
        await createInvoiceLine(invoiceId, lineData);
        results.success++;

        const montantHT = qty * subprice * (1 - remise / 100);
        const montantTTC = montantHT * (1 + tva / 100);
        totalTTCParFacture.set(invoiceId, (totalTTCParFacture.get(invoiceId) || 0) + montantTTC);
      } catch (error) {
        results.errors++;
        results.errorDetails.push(`Erreur ligne ${detail.ref_detail}: ${error.message}`);
      }
    }

    // 3bis. Valider les factures
    for (const [numFacture, invoiceId] of facturesMap) {
      try {
        await validateInvoice(invoiceId);
        console.log(`[Facture ${numFacture}] Validée`);
      } catch (error) {
        results.errors++;
        results.errorDetails.push(`Erreur validation ${numFacture}: ${error.message}`);
      }
    }

    // 4. Créer les paiements AVEC CALCUL DES REMISES
    const discountResults = [];

    for (const paiement of paiements) {
      const factureRef = paiement.ref_detail || paiement.num_facture;
      const invoiceId = facturesMap.get(factureRef);

      if (!invoiceId) {
        results.errors++;
        results.errorDetails.push(`Paiement ${factureRef}: facture liée introuvable`);
        continue;
      }

      const montant = parseFloat(paiement.montant);
      const accountid = getAccountId(paiement.caisse);
      const paymentid = getPaymentId(paiement.caisse);

      if (!accountid || !paymentid) {
        results.errors++;
        results.errorDetails.push(
          `Paiement facture ${factureRef}: caisse "${paiement.caisse}" non reconnue`
        );
        continue;
      }

      try {
        // Récupérer la date d'échéance de la facture
        const invoiceData = factures.find(f => f.num_facture === factureRef);
        const invoiceDate = invoiceData?.date_limite_reglement || invoiceData?.date_facture || paiement.date_reglement;
        
        // CALCULER LA REMISE (sans enregistrement)
        const discountInfo = await calculateDiscountForPayment(
          invoiceDate,
          paiement.date_reglement,
          montant,
          factureRef
        );
        
        // STOCKER LE RÉSULTAT EN MÉMOIRE
        discountResults.push(discountInfo);
        
        // AFFICHER DANS LES LOGS
        console.log(`Facture ${factureRef}:`, {
          jours: discountInfo.daysDiff,
          remise: discountInfo.pourcentage + '%',
          original: discountInfo.originalAmount.toFixed(2) + '€',
          apresRemise: discountInfo.amountAfterDiscount.toFixed(2) + '€',
          economies: discountInfo.discountAmount.toFixed(2) + '€'
        });

        // Envoyer le paiement à Dolibarr (montant total)
        const paymentData = {
          datepaye: formatDate(paiement.date_reglement),
          paymentid,
          accountid,
          amount: montant,
          closepaidinvoices: 'no'
        };

        await createPayment(invoiceId, paymentData);

        // Persister le suivi du règlement (cashback/dépassement) en base SQLite
        const montantOriginal = totalTTCParFacture.get(invoiceId) || 0;
        const montantRemise = discountInfo.discountAmount;
        const montantCouvert = montant + montantRemise;
        const montantDepassement = Math.max(0, montantCouvert - montantOriginal);

        try {
          await createReglement({
            invoice_id: invoiceId,
            invoice_ref: factureRef,
            montant_original: montantOriginal,
            montant_paye_reel: montant,
            montant_remise: montantRemise,
            montant_couvert: montantCouvert,
            montant_depassement: montantDepassement,
            pourcentage_remise: discountInfo.pourcentage,
            date_paiement: formatDate(paiement.date_reglement)
          });
        } catch (reglementError) {
          console.error(`Erreur enregistrement règlement ${factureRef}:`, reglementError.response?.data || reglementError.message);
        }

        results.success++;
        
      } catch (error) {
        results.errors++;
        results.errorDetails.push(`Erreur paiement ${factureRef}: ${error.message}`);
      }
    }

    // STOCKER LES REMISES CALCULÉES
    calculatedDiscounts = discountResults;
    results.discounts = {
      total: discountResults.length,
      totalDiscount: discountResults.reduce((sum, d) => sum + d.discountAmount, 0),
      totalSaved: discountResults.reduce((sum, d) => sum + d.discountAmount, 0),
      details: discountResults
    };

    // Afficher un résumé
    console.log('Résumé de l\'importation:');
    console.log(`Succès: ${results.success}`);
    console.log(`Erreurs: ${results.errors}`);
    console.log(`Produits créés: ${results.products.created}`);
    if (discountResults.length > 0) {
      console.log(`Remises calculées: ${discountResults.length}`);
      console.log(`Total économisé: ${results.discounts.totalDiscount.toFixed(2)}€`);
    }

  } catch (error) {
    results.errors++;
    results.errorDetails.push(`Erreur générale: ${error.message}`);
  }

  return results;
};

// Formater les dates
const formatDate = (dateStr) => {
  if (!dateStr) return null;
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  }
  return dateStr;
};

// Calculer les statistiques pour le dashboard
export const calculateStats = (factures, details, paiements) => {
  const stats = {};

  factures.forEach(f => {
    const month = f.date_facture.split('/')[1] + '/' + f.date_facture.split('/')[2];
    if (!stats[month]) {
      stats[month] = { total: 0, paye: 0, restant: 0 };
    }

    const lignesFacture = details.filter(d => d.num_facture === f.num_facture);
    const totalFacture = lignesFacture.reduce((sum, d) => {
      const pu = parseFloat(d.pu_hors_Taxe) || 0;
      const qty = parseFloat(d.quantite) || 0;
      const remise = d.remise ? parseFloat(d.remise.replace('%', '')) : 0;
      const tva = d.taxe ? parseFloat(d.taxe.replace('%', '')) : 0;

      const montantHT = pu * qty * (1 - remise / 100);
      const montantTTC = montantHT * (1 + tva / 100);
      return sum + montantTTC;
    }, 0);

    stats[month].total += totalFacture;
  });

  paiements.forEach(p => {
    const month = p.date_reglement.split('/')[1] + '/' + p.date_reglement.split('/')[2];
    if (stats[month]) {
      stats[month].paye += parseFloat(p.montant);
    }
  });

  Object.keys(stats).forEach(month => {
    stats[month].restant = stats[month].total - stats[month].paye;
  });

  return stats;
};