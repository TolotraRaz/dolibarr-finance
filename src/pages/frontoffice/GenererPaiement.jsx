import React, { useState, useEffect } from 'react';
import { useClient } from '../../context/ClientContext';
import { getClientUnpaidInvoices } from '../../services/frontofficeService';
import { createEcheancier, getEcheanciersForFacture, payerEcheance, getReglementsForFacture, createReglement } from '../../services/discountService';
import { createPayment, getInvoicePayments } from '../../services/api';
import { getAccountId, getPaymentId } from '../../services/importService';

const todayISO = () => new Date().toISOString().slice(0, 10);

const GenererPaiement = () => {
  const { client } = useClient();
  const [invoicesInfo, setInvoicesInfo] = useState({}); // { [id]: { ref, total, restant } }
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(null);

  const [dateDebut, setDateDebut] = useState(todayISO());
  const [montantTotal, setMontantTotal] = useState('');
  const [nombrePaiements, setNombrePaiements] = useState('');
  const [joursIntervalle, setJoursIntervalle] = useState('');

  const [apercu, setApercu] = useState([]);
  const [echeanciers, setEcheanciers] = useState([]);
  const [caisse, setCaisse] = useState('Banque1');

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedInvoiceId) {
      loadEcheanciers(selectedInvoiceId);
      if (invoicesInfo[selectedInvoiceId]) {
        setMontantTotal(invoicesInfo[selectedInvoiceId].restant.toString());
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedInvoiceId]);

  const loadInvoices = async () => {
    try {
      setLoading(true);
      setError('');

      if (!client?.id) {
        setInvoicesInfo({});
        setSelectedInvoiceId(null);
        return;
      }

      const unpaidInvoices = await getClientUnpaidInvoices(client.id);

      const infos = {};
      for (const invoice of unpaidInvoices) {
        try {
          const [reglements, paiementsDolibarr] = await Promise.all([
            getReglementsForFacture(invoice.id),
            getInvoicePayments(invoice.id)
          ]);

          const total = parseFloat(invoice.total_ttc || invoice.total_ht || 0);

          const totalEncaisseDolibarr = (Array.isArray(paiementsDolibarr) ? paiementsDolibarr : [])
            .reduce((sum, p) => sum + parseFloat(p.amount || p.montant || 0), 0);

          const dejaCouvert = (Array.isArray(reglements) ? reglements : [])
            .reduce((sum, r) => sum + parseFloat(r.montant_couvert || 0), 0);

          const montantConsidereRegle = Math.max(totalEncaisseDolibarr, dejaCouvert);
          const restant = Math.max(0, Math.round((total - montantConsidereRegle) * 100) / 100);

          if (restant <= 0.01) continue;

          infos[invoice.id] = { ref: invoice.ref, total, restant };
        } catch {
          // Facture ignorée si ses données n'ont pas pu être récupérées
        }
      }

      setInvoicesInfo(infos);
      const idsRestants = Object.keys(infos);
      if (idsRestants.length > 0 && (!selectedInvoiceId || !infos[selectedInvoiceId])) {
        setSelectedInvoiceId(idsRestants[0]);
      } else if (idsRestants.length === 0) {
        setSelectedInvoiceId(null);
      }
    } catch {
      setError('Impossible de charger vos factures impayées.');
    } finally {
      setLoading(false);
    }
  };

  const loadEcheanciers = async (invoiceId) => {
    try {
      const data = await getEcheanciersForFacture(invoiceId);
      setEcheanciers(Array.isArray(data) ? data : []);
    } catch {
      setEcheanciers([]);
    }
  };

  // Calcule l'aperçu côté client (même logique que le serveur : dépassement/arrondi sur la dernière échéance)
  const calculerApercu = () => {
    const total = parseFloat(montantTotal);
    const nombre = parseInt(nombrePaiements, 10);
    const jours = parseInt(joursIntervalle, 10);

    if (!total || total <= 0 || !nombre || nombre <= 0 || !jours || jours <= 0 || !dateDebut) {
      setError('Veuillez saisir un montant, un nombre de paiements et un intervalle de jours valides');
      setApercu([]);
      return;
    }

    const montantBase = Math.floor((total / nombre) * 100) / 100;
    const lignes = [];
    let cumule = 0;
    const dateDebutObj = new Date(dateDebut);

    for (let i = 0; i < nombre; i++) {
      const date = new Date(dateDebutObj);
      date.setDate(date.getDate() + i * jours);

      let montant;
      if (i === nombre - 1) {
        montant = Math.round((total - cumule) * 100) / 100; // dépassement/reliquat absorbé ici
      } else {
        montant = montantBase;
        cumule = Math.round((cumule + montant) * 100) / 100;
      }

      lignes.push({ numero: i + 1, date_echeance: date.toISOString().slice(0, 10), montant });
    }

    setError('');
    setApercu(lignes);
  };

  // Génère et paie tout d'un coup
  const handleGenerer = async () => {
    if (!selectedInvoiceId || apercu.length === 0) {
      setError('Veuillez d\'abord calculer un aperçu valide');
      return;
    }
    const info = invoicesInfo[selectedInvoiceId];
    const accountid = getAccountId(caisse);
    const paymentid = getPaymentId(caisse);
    if (!accountid || !paymentid) {
      setError(`Mode de règlement "${caisse}" non reconnu`);
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      setMessage('');

      // 1. Créer l'échéancier + ses échéances côté serveur
      const echeancier = await createEcheancier({
        invoice_id: selectedInvoiceId,
        invoice_ref: info.ref,
        montant_total: parseFloat(montantTotal),
        nombre_paiements: parseInt(nombrePaiements, 10),
        jours_intervalle: parseInt(joursIntervalle, 10),
        date_debut: dateDebut
      });

      // 2. Payer directement toutes les échéances générées, une par une, dans l'ordre
      let nbPayees = 0;
      for (const echeance of echeancier.echeances) {
        const datePaiement = todayISO();

        await createPayment(selectedInvoiceId, {
          datepaye: datePaiement,
          paymentid,
          accountid,
          amount: echeance.montant,
          closepaidinvoices: 'no'
        });

        try {
          await createReglement({
            invoice_id: selectedInvoiceId,
            invoice_ref: info.ref,
            montant_original: echeancier.montant_total,
            montant_paye_reel: echeance.montant,
            montant_remise: 0,
            montant_couvert: echeance.montant,
            montant_depassement: 0,
            pourcentage_remise: 0,
            date_paiement: datePaiement
          });
        } catch {
          console.error("Le suivi du règlement n'a pas pu être enregistré.");
        }

        await payerEcheance(echeance.id, datePaiement);
        nbPayees++;
      }

      setMessage(`Échéancier généré et ${nbPayees} paiement(s) sur ${echeancier.echeances.length} exécuté(s) avec succès.`);
      setApercu([]);
      setNombrePaiements('');
      setJoursIntervalle('');
      loadEcheanciers(selectedInvoiceId);
      loadInvoices();
    } catch (err) {
      setError("Erreur lors de la génération / du paiement : " + (err.response?.data?.error?.message || err.response?.data?.error || err.message));
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
  const info = invoicesInfo[selectedInvoiceId];

  return (
    <div className="container">
      <div className="card">
        <h2>Générer un échéancier de paiement</h2>

        {idsDisponibles.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#666' }}>
            <p>Aucune facture en attente de règlement.</p>
          </div>
        )}

        {idsDisponibles.length > 0 && info && (
          <>
            <div className="form-group">
              <label>Facture concernée</label>
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
                <label>Date de début</label>
                <input type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Montant total à échelonner</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={montantTotal}
                  onChange={(e) => setMontantTotal(e.target.value)}
                  placeholder="Ex: 1000"
                />
              </div>
            </div>

            <div className="grid-2">
              <div className="form-group">
                <label>Nombre de paiements</label>
                <input
                  type="number"
                  min="1"
                  value={nombrePaiements}
                  onChange={(e) => setNombrePaiements(e.target.value)}
                  placeholder="Ex: 5"
                />
              </div>
              <div className="form-group">
                <label>Intervalle (en jours)</label>
                <input
                  type="number"
                  min="1"
                  value={joursIntervalle}
                  onChange={(e) => setJoursIntervalle(e.target.value)}
                  placeholder="Ex: 7"
                />
              </div>
            </div>

            {/* Mode de règlement déplacé ici */}
            <div className="form-group">
              <label>Mode de règlement</label>
              <select value={caisse} onChange={(e) => setCaisse(e.target.value)}>
                <option value="Banque1">Virement (Banque1)</option>
                <option value="Caisse1">Espèces (Caisse1)</option>
              </select>
            </div>

            <button className="btn btn-secondary" onClick={calculerApercu}>
              Calculer l'aperçu
            </button>

            {apercu.length > 0 && (
              <div style={{ marginTop: '20px' }}>
                <h3>Aperçu de l'échéancier</h3>
                <div className="table-container">
                  <table>
                    <thead>
                      <tr><th>N°</th><th>Date</th><th>Montant</th></tr>
                    </thead>
                    <tbody>
                      {apercu.map(l => (
                        <tr key={l.numero}>
                          <td>{l.numero}</td>
                          <td>{l.date_echeance}</td>
                          <td>{l.montant.toFixed(2)} €</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan="2" style={{ textAlign: 'right' }}><strong>Total</strong></td>
                        <td><strong>{apercu.reduce((s, l) => s + l.montant, 0).toFixed(2)} €</strong></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <p style={{ color: '#666', fontSize: '13px' }}>
                  La dernière échéance absorbe automatiquement le reliquat d'arrondi ou de dépassement pour garantir un total exact.
                </p>
                <button className="btn btn-primary" style={{ marginTop: '10px' }} onClick={handleGenerer} disabled={submitting}>
                  {submitting ? 'Génération et paiement en cours...' : 'Confirmer, générer et payer toutes les échéances'}
                </button>
              </div>
            )}

            {error && <p style={{ color: '#dc3545', marginTop: '15px' }}>{error}</p>}
            {message && <p style={{ color: '#28a745', marginTop: '15px' }}>{message}</p>}

            {/* Échéanciers existants sans colonne action */}
            {echeanciers.length > 0 && (
              <div style={{ marginTop: '30px' }}>
                <h3>Échéanciers existants pour cette facture</h3>

                {echeanciers.map(ech => (
                  <div key={ech.id} style={{ background: '#f8f9fa', padding: '15px', borderRadius: '8px', marginBottom: '15px' }}>
                    <p><strong>Total : {ech.montant_total.toFixed(2)} € — {ech.nombre_paiements} paiements tous les {ech.jours_intervalle} jours à partir du {ech.date_debut}</strong></p>
                    <div className="table-container">
                      <table>
                        <thead>
                          <tr><th>N°</th><th>Date</th><th>Montant</th><th>Statut</th></tr>
                        </thead>
                        <tbody>
                          {ech.echeances.map(e => (
                            <tr key={e.id}>
                              <td>{e.numero}</td>
                              <td>{e.date_echeance}</td>
                              <td>{e.montant.toFixed(2)} €</td>
                              <td>{e.statut === 'payé' ? ' Payé' : ' En attente'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default GenererPaiement;