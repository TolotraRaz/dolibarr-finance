import { 
  getAllInvoices, getInvoicePayments, deletePayment, setInvoiceToUnpaid, 
  deleteInvoice, deleteThirdparty, getInvoiceLines, 
  deleteInvoiceLine, getProducts, deleteProduct, deleteBankLine,
  getBankAccounts, getBankLines
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

  try {
    // 1. Récupérer les factures avec préfixe 'F'
    const allInvoices = await getAllInvoices();
    const invoices = (Array.isArray(allInvoices) ? allInvoices : [])
      .filter(inv => inv.ref_client && inv.ref_client.startsWith('F'));

    if (invoices.length === 0) {
      stats.errorDetails.push('⚠️ Aucune facture trouvée avec le préfixe "F" dans ref_client');
      progressCallback(100);
      return stats;
    }

    const socidsToDelete = new Set();
    let processed = 0;
    const totalInvoices = invoices.length;

    // ============================================
    // ÉTAPE 1 : Récupérer TOUS les paiements et leurs écritures bancaires
    // ============================================
    const invoicePaymentsMap = new Map();
    const bankLinesToDelete = [];

    for (const invoice of invoices) {
      try {
        const payments = await getInvoicePayments(invoice.id);
        if (payments && payments.length > 0) {
          invoicePaymentsMap.set(invoice.id, payments);
          
          for (const payment of payments) {
            const bankLineId = payment.fk_bank || payment.bank_line || payment.id_bank;
            if (bankLineId) {
              bankLinesToDelete.push({ 
                lineId: bankLineId, 
                paymentId: payment.rowid || payment.id,
                invoiceId: invoice.id,
                invoiceRef: invoice.ref
              });
            }
          }
        }
      } catch (error) {
        // Ignorer
      }
    }

    // ============================================
    // ÉTAPE 2 : Supprimer les ÉCRITURES BANCAIRES
    // ============================================
    if (selectedTables.banque) {
      try {
        const bankAccounts = await getBankAccounts();
        const accounts = Array.isArray(bankAccounts) ? bankAccounts : [];

        for (const account of accounts) {
          try {
            const lines = await getBankLines(account.id);
            const linesArray = Array.isArray(lines) ? lines : [];

            for (const line of linesArray) {
              // Vérifier si cette ligne bancaire est liée à nos paiements
              const isLinked = bankLinesToDelete.some(b => b.lineId === line.id);
              
              if (isLinked) {
                try {
                  await deleteBankLine(account.id, line.id);
                  stats.details.banque.success++;
                  stats.success++;
                } catch (error) {
                  if (error.response?.status !== 404) {
                    stats.errors++;
                    stats.details.banque.errors++;
                    stats.errorDetails.push(`Ligne bancaire ${line.id}: ${error.message}`);
                  }
                }
              }
            }
          } catch (error) {
            // Ignorer les erreurs de récupération de lignes
          }
        }
      } catch (error) {
        stats.errorDetails.push(`Récupération des comptes bancaires: ${error.message}`);
      }
    }

    // ============================================
    // ÉTAPE 3 : Supprimer les PAIEMENTS
    // ============================================
    if (selectedTables.paiements) {
      for (const invoice of invoices) {
        const payments = invoicePaymentsMap.get(invoice.id) || [];
        for (const payment of payments) {
          try {
            const paymentId = payment.rowid || payment.id;
            if (!paymentId) {
              stats.details.paiements.success++;
              stats.success++;
              continue;
            }
            await deletePayment(paymentId);
            stats.details.paiements.success++;
            stats.success++;
          } catch (paymentError) {
            if (paymentError.response?.status === 400 || paymentError.response?.status === 404) {
              stats.details.paiements.success++;
              stats.success++;
            } else {
              stats.errors++;
              stats.details.paiements.errors++;
              stats.errorDetails.push(`Paiement ID ${payment.rowid || payment.id}: ${paymentError.message}`);
            }
          }
        }
      }
    }

    // ============================================
    // ÉTAPE 4 : Repasser en "non payée" (libère les verrous)
    // ============================================
    for (const invoice of invoices) {
      try {
        await setInvoiceToUnpaid(invoice.id);
      } catch (error) {
        // Ignorer, on tente quand même
      }
    }

    // ============================================
    // ÉTAPE 5 : Supprimer les LIGNES DE FACTURE
    // ============================================
    if (selectedTables.factureDet) {
      for (const invoice of invoices) {
        try {
          const lines = await getInvoiceLines(invoice.id);
          if (lines && lines.length > 0) {
            for (const line of lines) {
              try {
                await deleteInvoiceLine(invoice.id, line.id);
                stats.details.factureDet.success++;
                stats.success++;
              } catch (lineError) {
                if (lineError.response?.status === 404) {
                  stats.details.factureDet.success++;
                  stats.success++;
                } else {
                  stats.errors++;
                  stats.details.factureDet.errors++;
                  stats.errorDetails.push(`Ligne ${line.id} (facture ${invoice.ref}): ${lineError.message}`);
                }
              }
            }
          }
        } catch (error) {
          // Ignorer
        }
        processed++;
        const progressValue = (processed / totalInvoices) * 40;
        progressCallback(Math.min(Math.round(progressValue), 40));
      }
    }

    // ============================================
    // ÉTAPE 6 : Supprimer les FACTURES (SANS force)
    // ============================================
    if (selectedTables.factures) {
      for (const invoice of invoices) {
        try {
          // Suppression standard sans force
          await deleteInvoice(invoice.id);
          stats.details.factures.success++;
          stats.success++;
          if (invoice.socid) {
            socidsToDelete.add(invoice.socid);
          }
        } catch (error) {
          if (error.response?.status === 404) {
            stats.details.factures.success++;
            stats.success++;
            if (invoice.socid) socidsToDelete.add(invoice.socid);
          } else if (error.response?.status === 403) {
            // ⚠️ Facture non supprimable : on tente de la "clôturer" d'abord
            try {
              // Certaines versions permettent de clôturer avant suppression
              // Si ça existe, on peut essayer
              stats.errors++;
              stats.details.factures.errors++;
              stats.errorDetails.push(
                `❌ Facture ${invoice.ref} (ID: ${invoice.id}) : non supprimable. ` +
                `Vérifiez qu'aucun paiement ou écriture bancaire ne lui est lié.`
              );
            } catch (closeError) {
              stats.errors++;
              stats.details.factures.errors++;
              stats.errorDetails.push(`Facture ${invoice.ref}: ${error.message}`);
            }
          } else {
            stats.errors++;
            stats.details.factures.errors++;
            stats.errorDetails.push(`Facture ${invoice.ref}: ${error.message}`);
          }
        }
        processed++;
        const progressValue = 40 + (processed / totalInvoices) * 30;
        progressCallback(Math.min(Math.round(progressValue), 70));
      }
    }

    // ============================================
    // ÉTAPE 7 : Supprimer les TIERS
    // ============================================
    if (selectedTables.societes) {
      let processedSocids = 0;
      const totalSocids = socidsToDelete.size;
      
      for (const socid of socidsToDelete) {
        try {
          await deleteThirdparty(socid);
          stats.details.societes.success++;
          stats.success++;
        } catch (error) {
          if (error.response?.status === 409 || error.response?.status === 404) {
            stats.details.societes.success++;
            stats.success++;
          } else {
            stats.errors++;
            stats.details.societes.errors++;
            stats.errorDetails.push(`Tiers ID ${socid}: ${error.message}`);
          }
        }
        processedSocids++;
        const progressValue = 70 + (processedSocids / totalSocids) * 15;
        progressCallback(Math.min(Math.round(progressValue), 85));
      }
    }

    // ============================================
    // ÉTAPE 8 : Supprimer les PRODUITS
    // ============================================
    if (selectedTables.produits) {
      try {
        const products = await getProducts();
        const filteredProducts = (Array.isArray(products) ? products : [])
          .filter(p => p.ref && p.ref.startsWith('P'));
        
        let processedProducts = 0;
        const totalProducts = filteredProducts.length;
        
        for (const product of filteredProducts) {
          try {
            await deleteProduct(product.id);
            stats.details.produits.success++;
            stats.success++;
          } catch (error) {
            if (error.response?.status === 404) {
              stats.details.produits.success++;
              stats.success++;
            } else if (error.response?.status === 409) {
              // Produit utilisé ailleurs - on le signale mais on continue
              stats.errors++;
              stats.details.produits.errors++;
              stats.errorDetails.push(
                `⚠️ Produit ${product.ref} (id ${product.id}) : utilisé ailleurs. ` +
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
        stats.errorDetails.push(`Récupération des produits: ${error.message}`);
      }
    }

    progressCallback(100);
    
  } catch (error) {
    stats.errors++;
    stats.errorDetails.push(`❌ Erreur générale: ${error.message}`);
  }

  return stats;
};