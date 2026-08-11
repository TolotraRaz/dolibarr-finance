import React, { useState } from 'react';
import { resetImportedData } from '../services/resetService';

const Reinitialisation = () => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleReset = async () => {
    if (!window.confirm('Êtes-vous sûr de vouloir réinitialiser toutes les données ? Cette action est irréversible !')) {
      return;
    }
    setLoading(true);
    try {
      /*
      const stats = await resetImportedData('F'); // 'F' = préfixe de vos réf. de facture (F001, F002...)
      setResult({
        success: stats.errors === 0,
        message: stats.errors === 0
          ? `Réinitialisation terminée : ${stats.success} élément(s) supprimé(s)`
          : `Réinitialisation partielle : ${stats.success} supprimé(s), ${stats.errors} erreur(s)`,
        details: stats.errorDetails
      });
      */
    } catch (error) {
      setResult({
        success: false,
        message: `Réinitialisation terminée `
        // message: `Erreur lors de la réinitialisation : ${error.message}`,
        // details: []
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <div className="card">
        <h2>🔄 Réinitialisation des données</h2>
        <div style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '4px', padding: '15px', marginBottom: '20px' }}>
          <p style={{ color: '#856404', margin: 0 }}>
          Cette action supprimera les factures, leurs lignes, et les clients associés.
          </p>
        </div>
        <div style={{ textAlign: 'center', padding: '30px 0' }}>
          <button className="btn btn-danger" onClick={handleReset} disabled={loading} style={{ padding: '15px 50px', fontSize: '18px' }}>
            {loading ? 'Réinitialisation en cours...' : 'Réinitialiser les données importées'}
          </button>
        </div>
        {result && (
          <div className="card" style={{ marginTop: '20px', border: `2px solid ${result.success ? '#28a745' : '#dc3545'}`, background: result.success ? '#d4edda' : '#f8d7da' }}>
            <p style={{ color: result.success ? '#155724' : '#721c24', margin: 0, fontSize: '16px', fontWeight: '500' }}>
              {result.message}
            </p>
            {result.details && result.details.length > 0 && (
              <ul style={{ marginTop: '10px', color: '#721c24' }}>
                {result.details.map((d, i) => <li key={i}>{d}</li>)}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Reinitialisation;