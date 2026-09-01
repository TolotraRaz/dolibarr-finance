import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchProducts } from '../../services/frontofficeService';
import { useCart } from '../../context/CartContext';
import { useClient } from '../../context/ClientContext';
import { getProductPriceHistory } from '../../services/discountService';

// Calcule le prix TTC = PU × (1 + taux_taxe / 100)
// Si le produit a plusieurs niveaux de prix HT (multiprices), applique la formule
// à chaque niveau et retourne le maximum obtenu.
const calculerTTC = (pu, tauxTaxe) => {
  const prixHT = parseFloat(pu) || 0;
  const taxe = parseFloat(tauxTaxe) || 0;
  return prixHT * (1 + taxe / 100);
};

const TAUX_TVA_DEFAUT = 20; // Taux appliqué si le produit n'a pas de tva_tx défini

const getMaxPriceTTC = (product) => {
  const tauxTaxe = (product.tva_tx && parseFloat(product.tva_tx) > 0)
    ? parseFloat(product.tva_tx)
    : TAUX_TVA_DEFAUT;

  if (product.multiprices && typeof product.multiprices === 'object') {
    const valeursTTC = Object.values(product.multiprices)
      .map(pu => calculerTTC(pu, tauxTaxe))
      .filter(v => v > 0);
    if (valeursTTC.length > 0) {
      return Math.max(...valeursTTC);
    }
  }

  return calculerTTC(product.price || 0, tauxTaxe);
};

const Produits = () => {
  const navigate = useNavigate();
  const { addItem, items } = useCart();
  const { client } = useClient();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [quantities, setQuantities] = useState({});

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await fetchProducts();
      console.log('Structure d\'un produit (vérif multiprices):', data[0]); // ← ligne temporaire (log)
      setProducts(data);
    } catch (err) {
      setError('Impossible de charger les produits.');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (product) => {
    const qty = parseInt(quantities[product.id] || 1, 10);
    if (qty <= 0) return;
    const maxPriceTTC = getMaxPriceTTC(product);
  
    let priceHistory = [];
    try {
      priceHistory = await getProductPriceHistory(product.ref);
    } catch (e) {
      console.error('Erreur récupération historique prix:', e);
    }
  
    addItem({ ...product, maxPriceTTC, priceHistory }, qty);
  };

  const cartCount = items.reduce((sum, i) => sum + i.quantite, 0);

  if (loading) {
    return (
      <div className="container">
        <div className="card" style={{ textAlign: 'center', padding: '60px 20px' }}>
          <h3 style={{ color: '#0066cc' }}>Chargement des produits...</h3>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>Boutique {client && `— Bonjour ${client.name}`}</h2>
          <button className="btn btn-primary" onClick={() => navigate('/boutique/panier')}>
            Panier ({cartCount})
          </button>
        </div>

        {error && <p style={{ color: '#dc3545' }}>{error}</p>}

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Référence</th>
                <th>Produit</th>
                <th>Prix unitaire</th>
                <th>Prix maximum TTC</th>
                <th>Quantité</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {products.map(p => (
                <tr key={p.id}>
                  <td>{p.ref}</td>
                  <td>{p.label}</td>
                  <td>{parseFloat(p.price || p.price_ttc || 0).toFixed(2)} €</td>
                  <td>{getMaxPriceTTC(p).toFixed(2)} €</td>
                  <td>
                    <input
                      type="number"
                      min="1"
                      value={quantities[p.id] || 1}
                      onChange={(e) => setQuantities(prev => ({ ...prev, [p.id]: e.target.value }))}
                      style={{ width: '70px' }}
                    />
                  </td>
                  <td>
                    <button className="btn btn-secondary" onClick={() => handleAdd(p)}>
                      Ajouter
                    </button>
                  </td>
                </tr>
              ))}
              {products.length === 0 && (
                <tr><td colSpan="6" style={{ textAlign: 'center', color: '#666' }}>Aucun produit disponible</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Produits;