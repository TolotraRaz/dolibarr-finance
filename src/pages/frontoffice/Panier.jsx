import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { useClient } from '../../context/ClientContext';
import { createInvoiceFromCart, addDaysISO, todayISO, addPendingInvoice } from '../../services/frontofficeService';


const Panier = () => {
  const navigate = useNavigate();
  const { items, updateQuantity, updateRemise, updatePriceType, updateSelectedPrice, getEffectivePrice, removeItem, clearCart, total, totalAvecRemise } = useCart();
  const { client } = useClient();
  const [modeReglement, setModeReglement] = useState('maintenant');
  const [nbJours, setNbJours] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleValider = async () => {
    if (items.length === 0) {
      setError('Votre panier est vide');
      return;
    }
    if (modeReglement === 'delai' && (!nbJours || parseInt(nbJours, 10) <= 0)) {
      setError('Veuillez saisir un nombre de jours valide');
      return;
    }

    try {
      setSubmitting(true);
      setError('');

      const dateLimReglement = modeReglement === 'maintenant'
        ? todayISO()
        : addDaysISO(nbJours);

      const invoice = await createInvoiceFromCart(client, items, dateLimReglement);

      addPendingInvoice(invoice.id);
      clearCart();
      navigate('/boutique/paiement', { state: { invoiceId: invoice.id } });
    } catch (err) {
      setError("Erreur lors de la création de la facture : " + (err.response?.data?.error?.message || err.message));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container">
      <div className="card">
        <h2>Mon panier</h2>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Produit</th>
                <th>Prix unitaire</th>
                <th>Quantité</th>
                <th>Sous-total</th>
                <th>Remise (%)</th>
                <th>Total avec remise</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => {
                const prixEffectif = getEffectivePrice(item);
                const sousTotal = prixEffectif * item.quantite;
                const totalRemise = sousTotal * (1 - (item.remise || 0) / 100);
                return (
                  <tr key={item.id}>
                    <td>{item.label}</td>
                    <td>
                      <select
                        value={item.priceType === 'maxTTC' ? 'maxTTC' : item.selectedPrice}
                        onChange={(e) => {
                          if (e.target.value === 'maxTTC') {
                            updatePriceType(item.id, 'maxTTC');
                          } else {
                            updateSelectedPrice(item.id, e.target.value);
                          }
                        }}
                        style={{ marginBottom: '4px', display: 'block' }}
                      >
                        {(item.prixDisponibles || [item.price]).map((p, idx) => (
                          <option key={idx} value={p}>
                            Prix unitaire {idx + 1} ({p.toFixed(2)} €)
                          </option>
                        ))}
                        <option value="maxTTC">Prix maximum TTC ({(item.maxPriceTTC || item.price).toFixed(2)} €)</option>
                      </select>
                      <strong>{prixEffectif.toFixed(2)} €</strong>
                    </td>
                    <td>
                      <input
                        type="number"
                        min="1"
                        value={item.quantite}
                        onChange={(e) => updateQuantity(item.id, parseInt(e.target.value, 10) || 0)}
                        style={{ width: '70px' }}
                      />
                    </td>
                    <td>{sousTotal.toFixed(2)} €</td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={item.remise || 0}
                        onChange={(e) => updateRemise(item.id, e.target.value)}
                        style={{ width: '70px' }}
                      />
                    </td>
                    <td>{totalRemise.toFixed(2)} €</td>
                    <td>
                      <button className="btn btn-danger" onClick={() => removeItem(item.id)}>🗑️</button>
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr><td colSpan="7" style={{ textAlign: 'center', color: '#666' }}>Votre panier est vide</td></tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan="3" style={{ textAlign: 'right' }}><strong>Total</strong></td>
                <td colSpan="2"><strong>{total.toFixed(2)} €</strong></td>
                <td colSpan="2"><strong>{totalAvecRemise.toFixed(2)} €</strong></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {items.length > 0 && (
          <div style={{ marginTop: '30px' }}>
            <h3>Date de règlement</h3>
            <div className="form-group">
              <label>
                <input
                  type="radio"
                  checked={modeReglement === 'maintenant'}
                  onChange={() => setModeReglement('maintenant')}
                />{' '}
                Maintenant
              </label>
            </div>
            <div className="form-group">
              <label>
                <input
                  type="radio"
                  checked={modeReglement === 'delai'}
                  onChange={() => setModeReglement('delai')}
                />{' '}
                Dans un délai
              </label>
              {modeReglement === 'delai' && (
                <input
                  type="number"
                  min="1"
                  value={nbJours}
                  onChange={(e) => setNbJours(e.target.value)}
                  placeholder="Nombre de jours"
                  style={{ marginLeft: '10px', width: '150px' }}
                />
              )}
            </div>

            {error && <p style={{ color: '#dc3545' }}>{error}</p>}

            <button className="btn btn-primary" onClick={handleValider} disabled={submitting}>
              {submitting ? 'Création en cours...' : 'Valider le panier'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Panier;