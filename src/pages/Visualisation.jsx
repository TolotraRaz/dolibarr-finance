import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { processImportedData } from '../services/importService';

const Visualisation = () => {
  const navigate = useNavigate();
  const [factures, setFactures] = useState([]);
  const [details, setDetails] = useState([]);
  const [paiements, setPaiements] = useState([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState(null);
  const [showStats, setShowStats] = useState(false);

  useEffect(() => {
    // Récupérer les données stockées
    const facturesData = sessionStorage.getItem('facturesData');
    const detailsData = sessionStorage.getItem('detailsData');
    const paiementsData = sessionStorage.getItem('paiementsData');

    if (facturesData) setFactures(JSON.parse(facturesData));
    if (detailsData) setDetails(JSON.parse(detailsData));
    if (paiementsData) setPaiements(JSON.parse(paiementsData));
  }, []);

  const handleImport = async () => {
    setImporting(true);
    setProgress(0);
    setShowStats(false);

    try {
      const result = await processImportedData(
        factures,
        details,
        paiements,
        (pct) => setProgress(pct)   // callback de progression réelle
      );

      setStats(result);
      setShowStats(true);
    } catch (error) {
      setProgress(100);
      setStats({
        success: 0,
        errors: 1,
        errorDetails: [error.message]
      });
      setShowStats(true);
    } finally {
      setImporting(false);
    }
  };

  const handleRetour = () => {
    navigate('/importation');
  };

  return (
    <div className="container">
      <div className="card">
        <h2>Visualisation des données</h2>
        
        <div style={{ marginBottom: '20px' }}>
          <button className="btn btn-secondary" onClick={handleRetour}>
            Retour
          </button>
        </div>

        {/* Affichage des données */}
        <div className="grid-2">
          <div>
            <h3>Factures ({factures.length})</h3>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>N° Facture</th>
                    <th>Date</th>
                    <th>Client</th>
                  </tr>
                </thead>
                <tbody>
                  {factures.slice(0, 5).map((f, i) => (
                    <tr key={i}>
                      <td>{f.num_facture}</td>
                      <td>{f.date_facture}</td>
                      <td>{f.nom_client}</td>
                    </tr>
                  ))}
                  {factures.length > 5 && (
                    <tr>
                      <td colSpan="3" style={{ textAlign: 'center', color: '#666' }}>
                        ... et {factures.length - 5} autres
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h3>Détails ({details.length})</h3>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Produit</th>
                    <th>Qté</th>
                    <th>PU</th>
                  </tr>
                </thead>
                <tbody>
                  {details.slice(0, 5).map((d, i) => (
                    <tr key={i}>
                      <td>{d.produit}</td>
                      <td>{d.quantite}</td>
                      <td>{d.pu_hors_Taxe}</td>
                    </tr>
                  ))}
                  {details.length > 5 && (
                    <tr>
                      <td colSpan="3" style={{ textAlign: 'center', color: '#666' }}>
                        ... et {details.length - 5} autres
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div style={{ marginTop: '20px' }}>
          <h3>Paiements ({paiements.length})</h3>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Réf.</th>
                  <th>Date</th>
                  <th>Caisse</th>
                  <th>Montant</th>
                </tr>
              </thead>
              <tbody>
                {paiements.map((p, i) => (
                  <tr key={i}>
                    <td>{p.ref_detail}</td>
                    <td>{p.date_reglement}</td>
                    <td>{p.caisse}</td>
                    <td>{p.montant}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Bouton d'import */}
        <div style={{ marginTop: '30px', textAlign: 'center' }}>
          <button 
            className="btn btn-success" 
            onClick={handleImport}
            disabled={importing}
          >
            {importing ? 'Importation en cours...' : 'Importer dans Dolibarr'}
          </button>
        </div>

        {/* Barre de progression */}
        {importing && (
          <div className="progress-container">
            <div 
              className="progress-bar" 
              style={{ width: `${progress}%` }}
            >
              {progress}%
            </div>
          </div>
        )}

        {/* Statistiques d'import */}
        {showStats && stats && (
          <div className="card" style={{ marginTop: '20px', border: '2px solid #0066cc' }}>
            <h3 style={{ color: '#0066cc' }}>Statistiques d'importation</h3>
            <div className="stats-grid">
              <div className="stat-card success">
                <div className="label">Importés avec succès</div>
                <div className="value">{stats.success}</div>
              </div>
              <div className="stat-card error">
                <div className="label">En erreur</div>
                <div className="value">{stats.errors}</div>
              </div>
            </div>
            
            {stats.errorDetails && stats.errorDetails.length > 0 && (
              <div style={{ marginTop: '15px' }}>
                <h4 style={{ color: '#dc3545' }}>Détails des erreurs :</h4>
                <ul style={{ color: '#666', fontSize: '14px' }}>
                  {stats.errorDetails.map((error, i) => (
                    <li key={i}>• {error}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Affichage des remises calculées */}
            {stats.discounts && stats.discounts.total > 0 && (
              <div style={{ marginTop: '15px', padding: '15px', backgroundColor: '#e8f5e9', borderRadius: '5px' }}>
                <h4 style={{ color: '#2e7d32' }}> Remises appliquées</h4>
                <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                  <div>
                    <span style={{ color: '#666' }}>Nombre de remises :</span>
                    <strong style={{ marginLeft: '8px' }}>{stats.discounts.total}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#666' }}>Total économisé :</span>
                    <strong style={{ marginLeft: '8px', color: '#2e7d32' }}>
                      {stats.discounts.totalDiscount?.toFixed(2) || '0.00'}€
                    </strong>
                  </div>
                </div>
              </div>
            )}

            <div style={{ marginTop: '20px', textAlign: 'center' }}>
              <button 
                className="btn btn-primary" 
                onClick={() => navigate('/dashboard')}
              >
                Voir le Dashboard
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Visualisation;