import { getAllInvoices, getInvoicePayments, deletePayment, setInvoiceToUnpaid, deleteInvoice, deleteThirdparty } from './api';

export const resetImportedData = async (refPrefix = 'F') => {
  const results = { success: 0, errors: 0, errorDetails: [] };
  const socidsToCheck = new Set();

  try {
    const allInvoices = await getAllInvoices();

    // Filtre côté JavaScript au lieu du sqlfilters serveur (peu fiable sur /invoices)
    const invoices = (Array.isArray(allInvoices) ? allInvoices : [])
      .filter(inv => inv.ref_client && inv.ref_client.startsWith(refPrefix));

    if (invoices.length === 0) {
      results.errorDetails.push(`Aucune facture trouvée avec le préfixe "${refPrefix}" dans le champ ref_client (sur ${allInvoices.length} facture(s) au total dans Dolibarr)`);
      return results;
    }

    for (const invoice of invoices) {
      socidsToCheck.add(invoice.socid);

      const estPayee = invoice.paye === '1' || invoice.paye === 1 || parseFloat(invoice.totalpaye || 0) > 0;

      if (estPayee) {
        try {
          const payments = await getInvoicePayments(invoice.id);
          console.log(` [Facture ${invoice.ref}] Paiements trouvés:`, payments);
          
          for (const payment of payments) {
            console.log(`🗑️ Suppression paiement ID ${payment.id}...`);
            const delResult = await deletePayment(payment.id);
            console.log(` Paiement ${payment.id} supprimé:`, delResult);
          }
          
          await setInvoiceToUnpaid(invoice.id);
          console.log(` [Facture ${invoice.ref}] Mise à jour en "non payée" effectuée`);
        } catch (unpaidError) {
          results.errors++;
          results.errorDetails.push(
            `Facture ${invoice.ref}: impossible de supprimer le(s) paiement(s) lié(s) (${unpaidError.message}).`
          );
          continue;
        }
      }

      try {
        console.log(` Suppression facture ${invoice.ref} (ID: ${invoice.id})...`);
        await deleteInvoice(invoice.id);
        console.log(` Facture ${invoice.ref} supprimée avec succès`);
        results.success++;
      } catch (deleteError) {
        results.errors++;
        results.errorDetails.push(
          `Facture ${invoice.ref}: suppression impossible (${deleteError.message}). ` +
          `Limitation connue de l'API Dolibarr : le paiement lié bloque la suppression même après settounpaid. ` +
          `Allez dans Dolibarr > fiche facture ${invoice.ref} > onglet Paiements > supprimez le paiement manuellement, puis relancez la réinitialisation.`
        );
      }
    }

    console.log(` Suppression des tiers associés...`);
    for (const socid of socidsToCheck) {
      try {
        await deleteThirdparty(socid);
        console.log(` Tiers ID ${socid} supprimé avec succès`);
        results.success++;
      } catch (error) {
        results.errors++;
        results.errorDetails.push(`Tiers ID ${socid}: suppression impossible (${error.message})`);
      }
    }

    console.log(` Réinitialisation terminée : ${results.success} succès, ${results.errors} erreurs`);

  } catch (error) {
    results.errors++;
    results.errorDetails.push(`Erreur générale: ${error.message}`);
  }

  return results;
};