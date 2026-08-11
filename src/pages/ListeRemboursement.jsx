import React, { useState, useEffect } from 'react';
import { getRemboursements, annulerRemboursement } from '../services/discountService';

const ListeRemboursement = () => {
  const [remboursements, setRemboursements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedAnnulationId, setExpandedAnnulationId] = useState(null);
  const [dateAnnulationById, setDateAnnulationById] = useState({});

  useEffect(() => {
    loadRemboursements();
  }, []);

  const loadRemboursements = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await getRemboursements('actif');
      setRemboursements(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Erreur chargement remboursements:', err);
      setError('Impossible de charger la liste des remboursements.');
    } finally {
      setLoading(false);
    }
  };

  const toggleAnnulationForm = (id) => {
    setExpandedAnnulationId(prev => (prev === id ? null : id));
    setDateAnnulationById(prev => ({
      ...prev,
      [id]: prev[id] || new Date().toISOString().slice(0, 10)
    }));
  };

  const handleAnnuler = async (id, ref, montantCashback) => {
    const dateAnnulation = dateAnnulationById[id];
    if (!dateAnnulation) {
      alert("Veuillez sélectionner une date d'annulation.");
      return;
    }
    if (!window.confirm(
      `Annuler le remboursement de la facture ${ref} à la date du ${new Date(dateAnnulation).toLocaleDateString('fr-FR')} ?\n` +
      `Le pourcentage de cashback rendu sera calculé automatiquement selon les règles de remise.`
    )) return;

    try {
      const result = await annulerRemboursement(id, { date_annulation: dateAnnulation });
      alert(
        `Annulation effectuée.\n` +
        `Règle appliquée : ${result.regle_appliquee} (${result.pourcentage_retourne}%)\n` +
        `Cashback rendu : ${parseFloat(result.cashback_retourne).toFixed(2)} € sur ${parseFloat(montantCashback).toFixed(2)} €`
      );
      setRemboursements(prev => prev.filter(r => r.id !== id));
      setExpandedAnnulationId(null);
    } catch (err) {
      alert(`Erreur lors de l'annulation : ${err.response?.data?.error || err.message}`);
    }
  };

  if (loading) {
    return (
      <div className="container">
        <div className="card" style={{ textAlign: 'center', padding: '60px 20px' }}>
          <h3 style={{ color: '#0066cc' }}>Chargement des remboursements...</h3>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="card">
        <h2>Liste des remboursements</h2>

        {error && (
          <div style={{ background: '#f8d7da', color: '#dc3545', padding: '15px', borderRadius: '4px', marginBottom: '20px' }}>
            {error}
          </div>
        )}

        {remboursements.length === 0 ? (
          <p style={{ color: '#666', textAlign: 'center', padding: '40px 0' }}>
            Aucun remboursement actif pour le moment.
          </p>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>N° Facture</th>
                  <th>Montant remboursé</th>
                  <th>Cashback conservé</th>
                  <th>Date du remboursement</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {remboursements.map(r => (
                  <tr key={r.id}>
                    <td>{r.invoice_ref || r.invoice_id}</td>
                    <td>{parseFloat(r.montant_rembourse).toFixed(2)} €</td>
                    <td>{parseFloat(r.montant_cashback).toFixed(2)} €</td>
                    <td>{r.date_remboursement ? new Date(r.date_remboursement).toLocaleDateString('fr-FR') : '-'}</td>
                    <td>
                      {expandedAnnulationId === r.id ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '170px' }}>
                          <label style={{ fontSize: '12px', color: '#666' }}>Date d'annulation</label>
                          <input
                            type="date"
                            value={dateAnnulationById[r.id] || ''}
                            onChange={(e) =>
                              setDateAnnulationById(prev => ({ ...prev, [r.id]: e.target.value }))
                            }
                            style={{ fontSize: '12px', padding: '4px' }}
                          />
                          <p style={{ fontSize: '11px', color: '#999', margin: '2px 0' }}>
                            Le % de cashback rendu sera calculé automatiquement selon les règles de remise.
                          </p>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              className="btn btn-secondary"
                              onClick={() => handleAnnuler(r.id, r.invoice_ref || r.invoice_id, r.montant_cashback)}
                            >
                               Confirmer l'annulation
                            </button>
                            <button
                              className="btn btn-secondary"
                              onClick={() => setExpandedAnnulationId(null)}
                              style={{ background: '#eee' }}
                            >
                              Fermer
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          className="btn btn-secondary"
                          onClick={() => toggleAnnulationForm(r.id)}
                        >
                           Annuler
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ListeRemboursement;