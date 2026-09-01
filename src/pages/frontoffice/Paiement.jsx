import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useClient } from '../../context/ClientContext';
import {
  addPendingInvoice,
  getPendingInvoiceIds,
  removePendingInvoice
} from '../../services/frontofficeService';
import { calculateDiscount, createReglement, getReglementsForFacture } from '../../services/discountService';
import { createPayment, getInvoicesById } from '../../services/api';
import { getAccountId, getPaymentId } from '../../services/importService';

const Paiement = () => {
  const location = useLocation();
  const { client } = useClient();

  const [invoicesInfo, setInvoicesInfo] = useState({}); // { [id]: { ref, dateFacture, total, restant } }
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(null);
  const [datePaiement, setDatePaiement] = useState(new Date().toISOString().slice(0, 10));
  const [caisse, setCaisse] = useState('Banque1');
  const [montantSaisi, setMontantSaisi] = useState('');
  const [discountInfo, setDiscountInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedInvoiceId && invoicesInfo[selectedInvoiceId]) {
      updateDiscount();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedInvoiceId, datePaiement]);

  const loadInvoices = async () => {
    try {
      setLoading(true);
      setError('');

      if (location.state?.invoiceId) {
        addPendingInvoice(location.state.invoiceId);
      }

      const ids = getPendingInvoiceIds();
      if (ids.length === 0) {
        setInvoicesInfo({});
        setSelectedInvoiceId(null);
        return;
      }

      const infos = {};
      for (const id of ids) {
        try {
          const [invoice, reglements] = await Promise.all([
            getInvoicesById(id),
            getReglementsForFacture(id)
          ]);
          const total = parseFloat(invoice.total_ttc || invoice.total_ht || 0);
          const dejaCouvert = (Array.isArray(reglements) ? reglements : [])
            .reduce((sum, r) => sum + parseFloat(r.montant_couvert || 0), 0);
          const restant = Math.max(0, Math.round((total - dejaCouvert) * 100) / 100);

          if (restant <= 0.01) {
            removePendingInvoice(id);
            continue;
          }

          // Fallback identique à importService.js : échéance en priorité, sinon date de facture
          const dateReference = invoice.date_lim_reglement || invoice.date;
          infos[id] = { ref: invoice.ref, dateEcheance: dateReference, total, restant };
        } catch {
          removePendingInvoice(id);
        }
      }

      setInvoicesInfo(infos);

      const idsRestants = Object.keys(infos);
      if (idsRestants.length > 0 && (!selectedInvoiceId || !infos[selectedInvoiceId])) {
        setSelectedInvoiceId(idsRestants[0]);
      } else if (idsRestants.length === 0) {
        setSelectedInvoiceId(null);
      }
    } catch (err) {
      setError('Impossible de charger vos factures en attente de règlement.');
    } finally {
      setLoading(false);
    }
  };

  const updateDiscount = async () => {
    const info = invoicesInfo[selectedInvoiceId];
    if (!info) return;

    // Dolibarr renvoie souvent un timestamp Unix (secondes) pour les dates ; gérer les deux formats
    const parseDolibarrDate = (val) => {
      if (val === null || val === undefined) return null;
      // Timestamp Unix numérique (secondes)
      if (typeof val === 'number' || /^\d+$/.test(String(val))) {
        return new Date(Number(val) * 1000);
      }
      // Chaîne ISO ou YYYY-MM-DD
      return new Date(val);
    };

    const dateEcheance = parseDolibarrDate(info.dateEcheance);
    const datePaye = new Date(datePaiement);

    if (!dateEcheance || isNaN(dateEcheance.getTime())) {
      setDiscountInfo({ jours: 0, pourcentage: 0, label: 'Date de référence invalide' });
      return;
    }

    const jours = Math.max(0, Math.floor((datePaye - dateEcheance) / (1000 * 60 * 60 * 24)));

    try {
      const result = await calculateDiscount(jours, datePaiement);
      setDiscountInfo({ jours, ...result });
    } catch {
      setDiscountInfo({ jours, pourcentage: 0 });
    }
  };

  const info = invoicesInfo[selectedInvoiceId];
  const pourcentage = Math.min(99.99, discountInfo?.pourcentage || 0); // garde-fou division par zéro
  const cashNecessairePourSolder = info ? info.restant * (1 - pourcentage / 100) : 0;

  const handlePayer = async () => {
    if (!selectedInvoiceId || !info) {
      setError('Veuillez sélectionner une facture');
      return;
    }
    const saisi = parseFloat(montantSaisi);
    if (!saisi || saisi <= 0) {
      setError('Veuillez saisir un montant valide');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      setMessage('');

      const accountid = getAccountId(caisse);
      const paymentid = getPaymentId(caisse);
      if (!accountid || !paymentid) {
        setError(`Mode de règlement "${caisse}" non reconnu`);
        setSubmitting(false);
        return;
      }

      const montantCash = Math.round(saisi * 100) / 100;
      let montantCouvert, montantRemise, montantDepassement, estSoldee;

      if (montantCash >= cashNecessairePourSolder - 0.01) {
        montantCouvert = info.restant;
        montantRemise = Math.round((info.restant - cashNecessairePourSolder) * 100) / 100;
        montantDepassement = Math.round((montantCash - cashNecessairePourSolder) * 100) / 100;
        estSoldee = true;
      } else {
        montantCouvert = Math.round((montantCash / (1 - pourcentage / 100)) * 100) / 100;
        montantRemise = Math.round((montantCouvert - montantCash) * 100) / 100;
        montantDepassement = 0;
        estSoldee = false;
      }

      await createPayment(selectedInvoiceId, {
        datepaye: datePaiement,
        paymentid,
        accountid,
        amount: montantCash,
        closepaidinvoices: estSoldee ? 'yes' : 'no'
      });

      try {
        await createReglement({
          invoice_id: selectedInvoiceId,
          invoice_ref: info.ref,
          montant_original: info.total,
          montant_paye_reel: montantCash,
          montant_remise: montantRemise,
          montant_couvert: montantCouvert,
          montant_depassement: montantDepassement,
          pourcentage_remise: pourcentage,
          date_paiement: datePaiement
        });
      } catch {
        console.error("Le suivi du règlement n'a pas pu être enregistré.");
      }

      if (estSoldee) {
        removePendingInvoice(selectedInvoiceId);
        setMessage(
          montantDepassement > 0
            ? `Facture soldée. Versement de ${montantCash.toFixed(2)} € (remise ${montantRemise.toFixed(2)} €), dépassement de ${montantDepassement.toFixed(2)} € constaté.`
            : `Facture soldée avec ce versement de ${montantCash.toFixed(2)} € (remise ${montantRemise.toFixed(2)} € appliquée).`
        );
      } else {
        setMessage(
          `Versement de ${montantCash.toFixed(2)} € enregistré (couvre ${montantCouvert.toFixed(2)} € grâce à la remise de ${montantRemise.toFixed(2)} €). Restant dû : ${(info.restant - montantCouvert).toFixed(2)} €.`
        );
      }

      setMontantSaisi('');
      loadInvoices();
    } catch (err) {
      setError("Erreur lors du paiement : " + (err.response?.data?.error?.message || err.message));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="container">
        <div className="card" style={{ textAlign: 'center', padding: '60px 20px' }}>
          <h3 style={{ color: '#0066cc' }}>Chargement...</h3>
        </div>
      </div>
    );
  }

  const idsDisponibles = Object.keys(invoicesInfo);

  return (
    <div className="container">
      <div className="card">
        <h2>Saisie du règlement</h2>

        {idsDisponibles.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#666' }}>
            <p style={{ fontSize: '16px' }}>Aucune commande à régler pour le moment.</p>
            <p>Ajoutez des produits à votre panier et validez votre commande pour accéder au paiement.</p>
            <a href="/boutique/produits" className="btn btn-primary" style={{ marginTop: '15px', display: 'inline-block' }}>
              Voir les produits
            </a>
          </div>
        )}

        {idsDisponibles.length > 0 && info && (
          <>
            <div className="form-group">
              <label>Facture à régler</label>
              <select value={selectedInvoiceId || ''} onChange={(e) => setSelectedInvoiceId(e.target.value)}>
                {idsDisponibles.map(id => (
                  <option key={id} value={id}>
                    {invoicesInfo[id].ref} — Restant : {invoicesInfo[id].restant.toFixed(2)} €
                  </option>
                ))}
              </select>
            </div>

            <div className="grid-2">
              <div className="form-group">
                <label>Date de règlement</label>
                <input type="date" value={datePaiement} onChange={(e) => setDatePaiement(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Mode de règlement</label>
                <select value={caisse} onChange={(e) => setCaisse(e.target.value)}>
                  <option value="Banque1">Virement (Banque1)</option>
                  <option value="Caisse1">Espèces (Caisse1)</option>
                </select>
              </div>
            </div>

            <div style={{ background: '#f8f9fa', padding: '20px', borderRadius: '8px', marginTop: '20px' }}>
              <p><strong>Montant total facture :</strong> {info.total.toFixed(2)} €</p>
              <p><strong>Restant dû :</strong> {info.restant.toFixed(2)} €</p>
              {discountInfo && (
                <p style={{ color: '#28a745' }}>
                  <strong>Remise applicable à cette date ({discountInfo.jours} jour(s)) :</strong> {pourcentage}%
                  <br />
                  Montant à verser pour solder aujourd'hui : {cashNecessairePourSolder.toFixed(2)} €
                </p>
              )}
            </div>

            <div className="form-group" style={{ marginTop: '20px' }}>
              <label>Montant versé aujourd'hui</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={montantSaisi}
                onChange={(e) => setMontantSaisi(e.target.value)}
                placeholder="Ex: 500"
                style={{ width: '200px' }}
              />
              <p style={{ color: '#666', fontSize: '13px', marginTop: '4px' }}>
                Un montant inférieur à {cashNecessairePourSolder.toFixed(2)} € laisse la facture ouverte pour un prochain versement.
                Un montant supérieur solde la facture et l'excédent est enregistré comme dépassement.
              </p>
            </div>

            {error && <p style={{ color: '#dc3545', marginTop: '15px' }}>{error}</p>}
            {message && <p style={{ color: '#28a745', marginTop: '15px' }}>{message}</p>}

            <button className="btn btn-primary" style={{ marginTop: '20px' }} onClick={handlePayer} disabled={submitting}>
              {submitting ? 'Paiement en cours...' : ' Confirmer le versement'}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default Paiement;