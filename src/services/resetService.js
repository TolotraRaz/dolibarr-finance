import { 
  getAllInvoices, getInvoicePayments, deletePayment, setInvoiceToUnpaid,
  setInvoiceToDraft,
  deleteInvoice, deleteThirdparty, getInvoiceLines, 
  deleteInvoiceLine, getProducts, deleteProduct, deleteBankLine,
  getBankAccounts, getBankLines,
  getPaymentByRef,
  getCustomersByCodePrefix
} from './api';

export const resetSelectedTables = async (selectedTables, progressCallback) => {
  const stats = {
    success: 0,
    errors: 0,
    total: 0,
    details: {
      paiements: { success: 0, errors: 0 },
      factureDet: { success: 0, errors: 0 },
      factures: { success: 0, errors: 0 },
      societes: { success: 0, errors: 0 },
      produits: { success: 0, errors: 0 },
      banque: { success: 0, errors: 0 }
    },
    errorDetails: []
  };

  console.group('%c RÉINITIALISATION - DÉBUT', 'color: #007bff; font-size: 14px; font-weight: bold');
  console.log('Tables sélectionnées:', selectedTables);
  const startTime = performance.now();

  try {
    // ============================================
    // ÉTAPE 0 : Récupération des factures à traiter
    // ============================================
    console.group('ÉTAPE 0 : Récupération des factures');
    const allInvoices = await getAllInvoices();
    console.log(`Total factures récupérées de Dolibarr: ${Array.isArray(allInvoices) ? allInvoices.length : 0}`);
    
    const invoices = (Array.isArray(allInvoices) ? allInvoices : [])
      .filter(inv => inv.ref_client && inv.ref_client.startsWith('F'));

    console.log(`Factures avec préfixe 'F' dans ref_client: ${invoices.length}`);
    invoices.forEach(inv => {
      console.log(`   → Facture id=${inv.id} | ref=${inv.ref} | ref_client=${inv.ref_client} | socid=${inv.socid} | paye=${inv.paye} | statut=${inv.statut}`);
    });

    const socidsToDelete = new Set();
    let processed = 0;
    const totalInvoices = invoices.length;
    console.groupEnd(); // ÉTAPE 0

    // ============================================
    // ÉTAPE 1 : Récupérer TOUS les paiements et leurs écritures bancaires
    // ============================================
    console.group('ÉTAPE 1 : Récupération des paiements par facture');
    const invoicePaymentsMap = new Map();
    const bankLinesToDelete = [];

    for (const invoice of invoices) {
      try {
        const payments = await getInvoicePayments(invoice.id);
        console.log(`Facture ${invoice.ref} (id=${invoice.id}) → ${payments?.length || 0} paiement(s) trouvé(s)`);
        
        if (payments && payments.length > 0) {
          invoicePaymentsMap.set(invoice.id, payments);
          
          payments.forEach((payment, idx) => {
            console.log(`   [${idx}] Structure du paiement:`, {
              rowid: payment.rowid,
              id: payment.id,
              ref: payment.ref,
              amount: payment.amount,
              fk_bank: payment.fk_bank,
              bank_line: payment.bank_line,
              id_bank: payment.id_bank,
              keys: Object.keys(payment)
            });

            const bankLineId = payment.fk_bank || payment.bank_line || payment.id_bank;
            if (bankLineId) {
              bankLinesToDelete.push({ 
                lineId: bankLineId, 
                paymentId: payment.rowid || payment.id,
                invoiceId: invoice.id,
                invoiceRef: invoice.ref
              });
            }
          });
        }
      } catch (error) {
        console.error(`Erreur getInvoicePayments(${invoice.id}):`, error);
      }
    }

    console.log(`Récapitulatif ÉTAPE 1:`);
    console.log(`   → Factures avec paiements: ${invoicePaymentsMap.size}`);
    console.log(`   → Lignes bancaires à supprimer: ${bankLinesToDelete.length}`);
    console.log(`   → Détail des lignes bancaires:`, bankLinesToDelete);
    console.groupEnd(); // ÉTAPE 1

    // ============================================
    // ÉTAPE 2 : Supprimer les ÉCRITURES BANCAIRES
    // ============================================
    if (selectedTables.banque) {
      console.group('ÉTAPE 2 : Suppression des écritures bancaires');
      try {
        const bankAccounts = await getBankAccounts();
        const accounts = Array.isArray(bankAccounts) ? bankAccounts : [];
        console.log(`Comptes bancaires trouvés: ${accounts.length}`);

        for (const account of accounts) {
          try {
            const lines = await getBankLines(account.id);
            const linesArray = Array.isArray(lines) ? lines : [];
            console.log(`   Compte ${account.id} (${account.ref || account.label}): ${linesArray.length} ligne(s)`);

            for (const line of linesArray) {
              const isLinked = bankLinesToDelete.some(b => b.lineId === line.id);
              
              if (isLinked) {
                console.log(`   Suppression ligne bancaire id=${line.id} (compte ${account.id})`);
                try {
                  const result = await deleteBankLine(account.id, line.id);
                  console.log(`   Ligne ${line.id} supprimée. Réponse:`, result);
                  stats.details.banque.success++;
                  stats.success++;
                } catch (error) {
                  console.error(`   Échec suppression ligne ${line.id}:`, {
                    status: error.response?.status,
                    data: error.response?.data,
                    message: error.message
                  });
                  if (error.response?.status !== 404) {
                    stats.errors++;
                    stats.details.banque.errors++;
                    stats.errorDetails.push(`Ligne bancaire ${line.id}: ${error.message}`);
                  }
                }
              }
            }
          } catch (error) {
            console.warn(`   Erreur récupération lignes compte ${account.id}:`, error.message);
          }
        }
      } catch (error) {
        console.error(' Erreur récupération comptes bancaires:', error);
        stats.errorDetails.push(`Récupération des comptes bancaires: ${error.message}`);
      }
      console.log(` Bilan ÉTAPE 2: ${stats.details.banque.success} succès, ${stats.details.banque.errors} erreur(s)`);
      console.groupEnd(); // ÉTAPE 2
    } else {
      console.log(' ÉTAPE 2 : Écritures bancaires NON sélectionnées (ignorée)');
    }

    // ============================================
    // ÉTAPE 3 : Supprimer les PAIEMENTS
    // ============================================
    if (selectedTables.paiements) {
      console.group(' ÉTAPE 3 : Suppression des paiements');

      for (const invoice of invoices) {
        const payments = invoicePaymentsMap.get(invoice.id) || [];
        console.log(` Facture ${invoice.ref}: ${payments.length} paiement(s) à traiter`);
      
        for (const payment of payments) {
          console.log(`   Paiement ref=${payment.ref} | amount=${payment.amount} | fk_bank_line=${payment.fk_bank_line}`);
        
          // Résolution de l'ID via la ref (car Dolibarr 23 ne le renvoie pas)
          let paymentId = null;
        
          // Stratégie 1 : ID direct s'il existe (anciennes versions Dolibarr)
          paymentId = payment.rowid ?? payment.id ?? payment.fk_paiement ?? null;
        
          // Stratégie 2 : Recherche par ref (Dolibarr 23)
          if (!paymentId && payment.ref) {
            console.log(`    Pas d'ID direct → recherche via ref="${payment.ref}"`);
            const found = await getPaymentByRef(payment.ref);
            if (found) {
              paymentId = found.rowid ?? found.id ?? null;
              console.log(`    ID résolu via ref: ${paymentId}`);
            }
          }
        
          // Si toujours pas d'ID → erreur explicite
          if (!paymentId) {
            console.error(`    Impossible de résoudre l'ID du paiement ref=${payment.ref}`);
            stats.errors++;
            stats.details.paiements.errors++;
            stats.errorDetails.push(
              `Paiement ref=${payment.ref} (facture ${invoice.ref}): ID introuvable (ni rowid, ni via recherche ref)`
            );
            continue;
          }
        
          // Suppression effective
          try {
            const result = await deletePayment(paymentId);
            console.log(`    DELETE /paiements/${paymentId} → réponse:`, result);
            stats.details.paiements.success++;
            stats.success++;
          } catch (paymentError) {
            console.error(`    Échec DELETE paiement ${paymentId}:`, {
              status: paymentError.response?.status,
              data: paymentError.response?.data,
              message: paymentError.message
            });
          
            if (paymentError.response?.status === 400 || paymentError.response?.status === 404) {
              console.warn(`    Statut ${paymentError.response.status} → considéré comme succès (déjà absent)`);
              stats.details.paiements.success++;
              stats.success++;
            } else {
              stats.errors++;
              stats.details.paiements.errors++;
              stats.errorDetails.push(`Paiement ID ${paymentId} (ref=${payment.ref}): ${paymentError.message}`);
            }
          }
        }
      }

      console.log(` Bilan ÉTAPE 3: ${stats.details.paiements.success} succès, ${stats.details.paiements.errors} erreur(s)`);
      console.groupEnd();
    } else {
      console.log(' ÉTAPE 3 : Paiements NON sélectionnés (ignorée)');
    }

    // ============================================
    // ÉTAPE 4 : Repasser en "non payée" (libère les verrous)
    // ============================================
    console.group(' ÉTAPE 4 : Déverrouillage des factures (settounpaid)');
    for (const invoice of invoices) {
      try {
        const result = await setInvoiceToUnpaid(invoice.id);
        console.log(`    Facture ${invoice.ref} (id=${invoice.id}) → settounpaid OK`, result);
      } catch (error) {
        console.warn(`    Facture ${invoice.ref} → settounpaid échoué:`, error.message);
      }
    }
    console.groupEnd(); // ÉTAPE 4

    // ============================================
    // ÉTAPE 5 : Supprimer les LIGNES DE FACTURE
    // ============================================
    if (selectedTables.factureDet) {
      console.group('📋 ÉTAPE 5 : Suppression des lignes de facture');
      processed = 0;

      for (const invoice of invoices) {
        // NOUVEAU : Repasser la facture en brouillon AVANT de toucher aux lignes
        console.log(` Facture ${invoice.ref} (id=${invoice.id}) → tentative settodraft...`);
        try {
          await setInvoiceToDraft(invoice.id);
          console.log(`   Facture ${invoice.ref} est maintenant en BROUILLON`);
          // Petit délai pour laisser Dolibarr finaliser la transaction
          await new Promise(r => setTimeout(r, 300));
        } catch (draftError) {
          console.error(`    Impossible de repasser la facture ${invoice.ref} en brouillon:`, {
            status: draftError.response?.status,
            data: draftError.response?.data,
            message: draftError.message
          });
          stats.errors++;
          stats.details.factureDet.errors++;
          stats.errorDetails.push(
            `Facture ${invoice.ref}: impossible de la repasser en brouillon ` +
            `(${draftError.response?.data?.error?.message || draftError.message}). ` +
            `Vérifiez qu'aucun paiement n'y est encore lié.`
          );
          processed++;
          continue; // on passe à la facture suivante
        }
      
        // Suppression des lignes
        try {
          const lines = await getInvoiceLines(invoice.id);
          console.log(` Facture ${invoice.ref}: ${lines?.length || 0} ligne(s)`);

          if (lines && lines.length > 0) {
            for (const line of lines) {
              try {
                await deleteInvoiceLine(invoice.id, line.id);
                console.log(`    Ligne ${line.id} supprimée`);
                stats.details.factureDet.success++;
                stats.success++;
              } catch (lineError) {
                console.error(`    Échec suppression ligne ${line.id}:`, {
                  status: lineError.response?.status,
                  data: lineError.response?.data,
                  message: lineError.message
                });

                if (lineError.response?.status === 404) {
                  stats.details.factureDet.success++;
                  stats.success++;
                } else {
                  stats.errors++;
                  stats.details.factureDet.errors++;
                  stats.errorDetails.push(
                    `Ligne ${line.id} (facture ${invoice.ref}): ` +
                    `${lineError.response?.data?.error?.message || lineError.message}`
                  );
                }
              }
            }
          }
        } catch (error) {
          console.error(` Erreur getInvoiceLines(${invoice.id}):`, error.message);
          stats.errors++;
          stats.details.factureDet.errors++;
          stats.errorDetails.push(`Lecture des lignes de ${invoice.ref}: ${error.message}`);
        }

        processed++;
        const progressValue = (processed / totalInvoices) * 40;
        progressCallback(Math.min(Math.round(progressValue), 40));
      }

      console.log(` Bilan ÉTAPE 5: ${stats.details.factureDet.success} succès, ${stats.details.factureDet.errors} erreur(s)`);
      console.groupEnd();
    } else {
      console.log(' ÉTAPE 5 : Lignes de facture NON sélectionnées (ignorée)');
    }

    // ============================================
    // ÉTAPE 6 : Supprimer les FACTURES (SANS force)
    // ============================================
    if (selectedTables.factures) {
      console.group('ÉTAPE 6 : Suppression des factures');
      processed = 0;

      // 🔑 CORRECTION : Trier par ID DÉCROISSANT pour supprimer les plus récentes d'abord
      const invoicesSorted = [...invoices].sort((a, b) => (b.id || 0) - (a.id || 0));
      console.log(` Ordre de suppression: ${invoicesSorted.map(i => `${i.ref}(id=${i.id})`).join(' → ')}`);

      for (const invoice of invoicesSorted) {
        try {
          console.log(`    DELETE /invoices/${invoice.id} (ref=${invoice.ref})`);
          await deleteInvoice(invoice.id);
          console.log(`    Facture ${invoice.ref} supprimée`);
          stats.details.factures.success++;
          stats.success++;
          if (invoice.socid) {
            socidsToDelete.add(invoice.socid);
            console.log(`    socid ${invoice.socid} ajouté à la liste de suppression des tiers`);
          }
        } catch (error) {
          // ... votre gestion d'erreur existante
        }
        processed++;
        const progressValue = 40 + (processed / totalInvoices) * 30;
        progressCallback(Math.min(Math.round(progressValue), 70));
      }

      console.log(` Bilan ÉTAPE 6: ${stats.details.factures.success} succès, ${stats.details.factures.errors} erreur(s)`);
      console.groupEnd();
    }

    // ============================================
    // ÉTAPE 7 : Supprimer les TIERS
    // ============================================
    if (selectedTables.societes) {
      console.group(' ÉTAPE 7 : Suppression des tiers');

      // NOUVELLE LOGIQUE : on récupère les tiers directement via leur code_client
      // (indépendant de la suppression préalable des factures)
      const tiersList = await getCustomersByCodePrefix('C');

      // On y ajoute aussi les socids collectés lors de la suppression des factures (si applicable)
      const socidsFromInvoices = Array.from(socidsToDelete);
      const socidsFromDirect = tiersList.map(t => t.id || t.rowid);

      // Fusion + dédoublonnage
      const allSocidsToDelete = new Set([...socidsFromDirect, ...socidsFromInvoices]);

      console.log(` Tiers à supprimer: ${allSocidsToDelete.size}`);
      console.log(`   → Via code_client 'C%': ${socidsFromDirect.length}`);
      console.log(`   → Via factures supprimées: ${socidsFromInvoices.length}`);
      console.log(`   → Liste finale:`, Array.from(allSocidsToDelete));
    
      if (allSocidsToDelete.size === 0) {
        console.warn('    Aucun tiers à supprimer');
        progressCallback(85);
      } else {
        let processedSocids = 0;
        const totalSocids = allSocidsToDelete.size;
      
        for (const socid of allSocidsToDelete) {
          try {
            console.log(`    DELETE /thirdparties/${socid}`);
            await deleteThirdparty(socid);
            console.log(`    Tiers ${socid} supprimé`);
            stats.details.societes.success++;
            stats.success++;
          } catch (error) {
            console.error(`    Échec suppression tiers ${socid}:`, {
              status: error.response?.status,
              data: error.response?.data,
              message: error.message
            });

            if (error.response?.status === 404) {
              stats.details.societes.success++;
              stats.success++;
            } else if (error.response?.status === 409) {
              stats.errors++;
              stats.details.societes.errors++;
              stats.errorDetails.push(
                ` Tiers ${socid} : utilisé ailleurs (409). ` +
                `Vérifiez les commandes, devis, contrats ou agenda liés.`
              );
            } else {
              stats.errors++;
              stats.details.societes.errors++;
              stats.errorDetails.push(
                `Tiers ID ${socid}: ${error.response?.data?.error?.message || error.message}`
              );
            }
          }
          processedSocids++;
          const progressValue = 70 + (processedSocids / totalSocids) * 15;
          progressCallback(Math.min(Math.round(progressValue), 85));
        }
      }

      console.log(` Bilan ÉTAPE 7: ${stats.details.societes.success} succès, ${stats.details.societes.errors} erreur(s)`);
      console.groupEnd();
    } else {
      console.log(' ÉTAPE 7 : Tiers NON sélectionnés (ignorée)');
    }

    // ============================================
    // ÉTAPE 8 : Supprimer les PRODUITS
    // ============================================
    if (selectedTables.produits) {
      console.group(' ÉTAPE 8 : Suppression des produits');
      try {
        const products = await getProducts();
        const filteredProducts = (Array.isArray(products) ? products : [])
          .filter(p => p.ref && p.ref.startsWith('P'));
        
        console.log(`Produits avec préfixe 'P': ${filteredProducts.length}`);
        filteredProducts.forEach(p => {
          console.log(`   → Produit id=${p.id} ref=${p.ref} label=${p.label}`);
        });
        
        let processedProducts = 0;
        const totalProducts = filteredProducts.length;
        
        for (const product of filteredProducts) {
          try {
            console.log(`    DELETE /products/${product.id} (ref=${product.ref})`);
            await deleteProduct(product.id);
            console.log(`    Produit ${product.ref} supprimé`);
            stats.details.produits.success++;
            stats.success++;
          } catch (error) {
            console.error(`    Échec suppression produit ${product.ref}:`, {
              status: error.response?.status,
              data: error.response?.data,
              message: error.message
            });
            
            if (error.response?.status === 404) {
              stats.details.produits.success++;
              stats.success++;
            } else if (error.response?.status === 409) {
              stats.errors++;
              stats.details.produits.errors++;
              stats.errorDetails.push(
                ` Produit ${product.ref} (id ${product.id}) : utilisé ailleurs (409). ` +
                `Vérifiez les stocks, commandes, devis ou contrats.`
              );
            } else {
              stats.errors++;
              stats.details.produits.errors++;
              stats.errorDetails.push(`Produit ${product.ref}: ${error.message}`);
            }
          }
          processedProducts++;
          const progressValue = 85 + (processedProducts / totalProducts) * 15;
          progressCallback(Math.min(Math.round(progressValue), 99));
        }
      } catch (error) {
        console.error(' Erreur récupération produits:', error);
        stats.errorDetails.push(`Récupération des produits: ${error.message}`);
      }
      console.log(` Bilan ÉTAPE 8: ${stats.details.produits.success} succès, ${stats.details.produits.errors} erreur(s)`);
      console.groupEnd(); // ÉTAPE 8
    } else {
      console.log('ÉTAPE 8 : Produits NON sélectionnés (ignorée)');
    }

    progressCallback(100);
    
  } catch (error) {
    console.error(' ERREUR GÉNÉRALE:', error);
    stats.errors++;
    stats.errorDetails.push(` Erreur générale: ${error.message}`);
  }

  const duration = ((performance.now() - startTime) / 1000).toFixed(2);
  console.log(
    `%c STATS FINALES (${duration}s):`, 
    'color: purple; font-size: 14px; font-weight: bold', 
    stats
  );
  console.log('📋 Détail par table:');
  Object.entries(stats.details).forEach(([table, s]) => {
    const total = s.success + s.errors;
    if (total > 0) {
      console.log(`   ${table}:  ${s.success} succès |  ${s.errors} erreur(s)`);
    }
  });
  if (stats.errorDetails.length > 0) {
    console.warn(' Détails des erreurs:');
    stats.errorDetails.forEach((e, i) => console.warn(`   [${i}] ${e}`));
  }
  console.groupEnd(); // RÉINITIALISATION

  return stats;
};