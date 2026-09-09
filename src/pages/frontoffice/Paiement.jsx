import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useClient } from '../../context/ClientContext';
import { getClientUnpaidInvoices } from '../../services/frontofficeService';
import { calculateDiscount, createReglement, getReglementsForFacture } from '../../services/discountService';
import { createPayment, getInvoicePayments, getBankAccounts } from '../../services/api';
import { getAccountId, getPaymentId } from '../../services/importService';

const Paiement = () => {
  const location = useLocation();
  const { client } = useClient();

  const [invoicesInfo, setInvoicesInfo] = useState({}); // { [id]: { ref, dateFacture, total, restant } }
  const [selectedIds, setSelectedIds] = useState([]); // factures cochées
  const [montants, setMontants] = useState({}); // { [invoiceId]: montantSaisi }
  const [discountInfoParFacture, setDiscountInfoParFacture] = useState({}); // { [invoiceId]: {jours, pourcentage} }
  
  const [datePaiement, setDatePaiement] = useState(new Date().toISOString().slice(0, 10));
  const [caisse, setCaisse] = useState('');
  const [comptesBancaires, setComptesBancaires] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [confirmationRequise, setConfirmationRequise] = useState(false);
  const [historiquePaiements, setHistoriquePaiements] = useState({}); // { [invoiceId]: [...] }

  // Chargement des comptes bancaires
  useEffect(() => {
    getBankAccounts()
      .then(setComptesBancaires)
      .catch(() => setComptesBancaires([]));
  }, []);

  useEffect(() => {
    loadInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    selectedIds.forEach(id => updateDiscountForInvoice(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, datePaiement]);

  useEffect(() => {
    selectedIds.forEach(id => loadHistorique(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds]);

  const loadInvoices = async () => {
    try {
      setLoading(true);
      setError('');

      if (!client?.id) {
        setInvoicesInfo({});
        setSelectedIds([]);
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

          // Source de vérité argent réel : ce que Dolibarr a effectivement encaissé
          const totalEncaisseDolibarr = (Array.isArray(paiementsDolibarr) ? paiementsDolibarr : [])
            .reduce((sum, p) => sum + parseFloat(p.amount || p.montant || 0), 0);

          // Suivi local incluant la remise escompte
          const dejaCouvert = (Array.isArray(reglements) ? reglements : [])
            .reduce((sum, r) => sum + parseFloat(r.montant_couvert || 0), 0);

          // On garde le montant "couvert" le plus élevé pour éviter d'afficher
          // un restant supérieur à la réalité en cas de désynchronisation
          const montantConsidereRegle = Math.max(totalEncaisseDolibarr, dejaCouvert);
          const restant = Math.max(0, Math.round((total - montantConsidereRegle) * 100) / 100);

          if (restant <= 0.01) continue;

          infos[invoice.id] = { ref: invoice.ref, dateFacture: invoice.date, total, restant };
        } catch {
          // Facture ignorée si ses données n'ont pas pu être récupérées
        }
      }

      setInvoicesInfo(infos);

      const idsRestants = Object.keys(infos);
      // Présélection depuis location.state
      const preselection = location.state?.invoiceId && infos[location.state.invoiceId]
        ? [String(location.state.invoiceId)]
        : [];

      if (preselection.length > 0) {
        setSelectedIds(preselection);
      } else if (idsRestants.length > 0) {
        setSelectedIds([idsRestants[0]]);
      } else {
        setSelectedIds([]);
      }
    } catch (err) {
      setError('Impossible de charger vos factures impayées.');
    } finally {
      setLoading(false);
    }
  };

  const loadHistorique = async (invoiceId) => {
    try {
      const paiements = await getInvoicePayments(invoiceId);
      setHistoriquePaiements(prev => ({ ...prev, [invoiceId]: paiements }));
    } catch {
      setHistoriquePaiements(prev => ({ ...prev, [invoiceId]: [] }));
    }
  };

  const updateDiscountForInvoice = async (invoiceId) => {
    const info = invoicesInfo[invoiceId];
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

    const dateFacture = parseDolibarrDate(info.dateFacture);
    const datePaye = new Date(datePaiement);

    if (!dateFacture || isNaN(dateFacture.getTime())) {
      setDiscountInfoParFacture(prev => ({ 
        ...prev, 
        [invoiceId]: { jours: 0, pourcentage: 0, label: 'Date de référence invalide' } 
      }));
      return;
    }

    const jours = Math.max(0, Math.floor((datePaye - dateFacture) / (1000 * 60 * 60 * 24)));

    try {
      const result = await calculateDiscount(jours, datePaiement);
      setDiscountInfoParFacture(prev => ({ ...prev, [invoiceId]: { jours, ...result } }));
    } catch {
      setDiscountInfoParFacture(prev => ({ ...prev, [invoiceId]: { jours, pourcentage: 0 } }));
    }
  };

  const getDerived = (invoiceId) => {
    const info = invoicesInfo[invoiceId];
    const discount = discountInfoParFacture[invoiceId];
    const pourcentage = Math.min(99.99, discount?.pourcentage || 0);
    const cashNecessairePourSolder = info ? info.restant * (1 - pourcentage / 100) : 0;
    return { info, pourcentage, cashNecessairePourSolder };
  };

  const toggleSelection = (invoiceId) => {
    setSelectedIds(prev =>
      prev.includes(invoiceId) ? prev.filter(id => id !== invoiceId) : [...prev, invoiceId]
    );
    // Nettoyer le montant si on désélectionne
    if (selectedIds.includes(invoiceId)) {
      setMontants(prev => {
        const newMontants = { ...prev };
        delete newMontants[invoiceId];
        return newMontants;
      });
    }
  };

  const creerReglementAvecRetry = async (payload, tentatives = 3) => {
    for (let i = 0; i < tentatives; i++) {
      try {
        await createReglement(payload);
        return true;
      } catch {
        if (i === tentatives - 1) return false;
        await new Promise(r => setTimeout(r, 500 * (i + 1))); // backoff simple
      }
    }
    return false;
  };

  const handlePayerClick = () => {
    const invalides = selectedIds.filter(id => !(parseFloat(montants[id]) > 0));
    if (selectedIds.length === 0 || invalides.length > 0) {
      setError('Veuillez sélectionner au moins une facture et saisir un montant valide pour chacune');
      return;
    }
    
    // Vérifier que le mode de règlement est sélectionné
    if (!caisse) {
      setError('Veuillez sélectionner un mode de règlement');
      return;
    }
    
    setError('');
    setConfirmationRequise(true);
  };

  const handleConfirmerPaiement = async () => {
    setConfirmationRequise(false);
    await handlePayer();
  };

  const handlePayer = async () => {
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

      // Séparer les factures soldées vs non soldées
      const facturesSoldees = [];
      const facturesPartielles = [];

      for (const id of selectedIds) {
        const { info, pourcentage, cashNecessairePourSolder } = getDerived(id);
        const montantCash = Math.round(parseFloat(montants[id]) * 100) / 100;

        if (montantCash >= cashNecessairePourSolder - 0.01) {
          facturesSoldees.push({ id, info, pourcentage, cashNecessairePourSolder, montantCash });
        } else {
          facturesPartielles.push({ id, info, pourcentage, cashNecessairePourSolder, montantCash });
        }
      }

      // Traiter les paiements
      const traiterPaiement = async (factures, closepaid) => {
        if (factures.length === 0) return;

        // Pour chaque facture, on appelle createPayment séparément
        // car l'API paymentsdistributed accepte un array d'amounts
        // mais on va faire un appel par facture pour plus de simplicité
        for (const facture of factures) {
          const { id, info, pourcentage, cashNecessairePourSolder, montantCash } = facture;

          let montantCouvert, montantRemise, montantDepassement;
          const estSoldee = closepaid === 'yes';

          if (estSoldee) {
            montantCouvert = info.restant;
            montantRemise = Math.round((info.restant - cashNecessairePourSolder) * 100) / 100;
            montantDepassement = Math.round((montantCash - cashNecessairePourSolder) * 100) / 100;
          } else {
            montantCouvert = Math.round((montantCash / (1 - pourcentage / 100)) * 100) / 100;
            montantRemise = Math.round((montantCouvert - montantCash) * 100) / 100;
            montantDepassement = 0;
          }

          // Créer le paiement Dolibarr
          await createPayment(id, {
            datepaye: datePaiement,
            paymentid,
            accountid,
            amount: montantCash,
            closepaidinvoices: closepaid
          });

          // Enregistrer le suivi local avec retry
          const ok = await creerReglementAvecRetry({
            invoice_id: id,
            invoice_ref: info.ref,
            montant_original: info.total,
            montant_paye_reel: montantCash,
            montant_remise: montantRemise,
            montant_couvert: montantCouvert,
            montant_depassement: montantDepassement,
            pourcentage_remise: pourcentage,
            date_paiement: datePaiement
          });

          if (!ok) {
            setMessage(prev => 
              `${prev || ''} ⚠️ Attention : la remise n'a pas pu être enregistrée pour ${info.ref}, vérifiez manuellement cette facture.`
            );
          }
        }
      };

      await traiterPaiement(facturesSoldees, 'yes');
      await traiterPaiement(facturesPartielles, 'no');

      // Message de succès consolidé
      const totalPaye = selectedIds.reduce((sum, id) => sum + (parseFloat(montants[id]) || 0), 0);
      const nbFactures = selectedIds.length;
      setMessage(
        `✅ ${nbFactures} facture(s) traitée(s) pour un total de ${totalPaye.toFixed(2)} €. ` +
        `${facturesSoldees.length} facture(s) soldée(s), ${facturesPartielles.length} partielle(s).`
      );

      // Réinitialisation
      setMontants({});
      setSelectedIds([]);
      setConfirmationRequise(false);
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
  const totalConsolide = selectedIds.reduce((sum, id) => sum + (parseFloat(montants[id]) || 0), 0);

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

        {idsDisponibles.length > 0 && (
          <>
            <div className="form-group">
              <label>Sélectionnez les factures à régler</label>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th></th>
                      <th>Facture</th>
                      <th>Restant</th>
                      <th>Remise</th>
                      <th>À solder</th>
                      <th>Montant à verser</th>
                    </tr>
                  </thead>
                  <tbody>
                    {idsDisponibles.map(id => {
                      const { info, pourcentage, cashNecessairePourSolder } = getDerived(id);
                      const checked = selectedIds.includes(id);
                      const historique = historiquePaiements[id] || [];
                      
                      return (
                        <React.Fragment key={id}>
                          <tr>
                            <td>
                              <input 
                                type="checkbox" 
                                checked={checked} 
                                onChange={() => toggleSelection(id)} 
                              />
                            </td>
                            <td>{info.ref}</td>
                            <td>{info.restant.toFixed(2)} €</td>
                            <td>{pourcentage}%</td>
                            <td>{cashNecessairePourSolder.toFixed(2)} €</td>
                            <td>
                              {checked && (
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0.01"
                                  value={montants[id] || ''}
                                  onChange={(e) => setMontants(prev => ({ ...prev, [id]: e.target.value }))}
                                  style={{ width: '120px' }}
                                  placeholder="Montant"
                                />
                              )}
                            </td>
                          </tr>
                          {checked && historique.length > 0 && (
                            <tr>
                              <td colSpan="6" style={{ padding: '5px 10px', fontSize: '13px', color: '#666' }}>
                                <strong>Déjà réglé :</strong>
                                {historique.map((p, i) => (
                                  <span key={i}>
                                    {' '}{parseFloat(p.amount || p.montant || 0).toFixed(2)}€ le {p.datepaye || p.date || 'N/A'}
                                    {i < historique.length - 1 ? ' ;' : ''}
                                  </span>
                                ))}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid-2" style={{ marginTop: '20px' }}>
              <div className="form-group">
                <label>Date de règlement</label>
                <input type="date" value={datePaiement} onChange={(e) => setDatePaiement(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Mode de règlement</label>
                <select value={caisse} onChange={(e) => setCaisse(e.target.value)}>
                  <option value="">Sélectionnez un mode</option>
                  {comptesBancaires.map(compte => (
                    <option key={compte.id} value={compte.id}>{compte.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {selectedIds.length > 0 && (
              <div style={{ marginTop: '15px', fontWeight: 'bold', fontSize: '16px' }}>
                Total à verser aujourd'hui : {totalConsolide.toFixed(2)} €
                <span style={{ fontWeight: 'normal', fontSize: '14px', color: '#666', marginLeft: '10px' }}>
                  ({selectedIds.length} facture{selectedIds.length > 1 ? 's' : ''} sélectionnée{selectedIds.length > 1 ? 's' : ''})
                </span>
              </div>
            )}

            {error && <p style={{ color: '#dc3545', marginTop: '15px' }}>{error}</p>}
            {message && <p style={{ color: '#28a745', marginTop: '15px' }}>{message}</p>}

            <button 
              className="btn btn-primary" 
              style={{ marginTop: '20px' }} 
              onClick={handlePayerClick} 
              disabled={submitting || selectedIds.length === 0}
            >
              {submitting ? 'Paiement en cours...' : ' Vérifier et confirmer le paiement'}
            </button>

            {/* Étape de confirmation */}
            {confirmationRequise && (
              <div className="card" style={{ marginTop: '15px', border: '1px solid #0066cc', background: '#f0f7ff' }}>
                <h3 style={{ color: '#0066cc' }}>📋 Confirmer le règlement</h3>
                {selectedIds.map(id => {
                  const { info } = getDerived(id);
                  return (
                    <p key={id}>
                      <strong>{info.ref}</strong> : {parseFloat(montants[id] || 0).toFixed(2)} €
                    </p>
                  );
                })}
                <p style={{ fontWeight: 'bold' }}>
                  Total : {totalConsolide.toFixed(2)} €
                </p>
                <p style={{ color: '#666', fontSize: '14px' }}>
                  Mode de règlement : {comptesBancaires.find(c => String(c.id) === String(caisse))?.label || caisse}
                </p>
                <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                  <button className="btn btn-secondary" onClick={() => setConfirmationRequise(false)}>
                    Annuler
                  </button>
                  <button className="btn btn-primary" onClick={handleConfirmerPaiement} disabled={submitting}>
                    {submitting ? 'Paiement en cours...' : 'Confirmer et payer'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Paiement;