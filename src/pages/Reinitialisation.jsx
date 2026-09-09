import React, { useState } from 'react';
import { resetSelectedTables } from '../services/resetService';

const Reinitialisation = () => {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [selectedTables, setSelectedTables] = useState({
    paiements: true,
    factureDet: true,
    factures: true,
    societes: true,
    produits: true,
    banque: true
  });

  const tablesList = [
    { id: 'paiements', label: 'Paiements (llx_paiement, llx_paiement_facture)', icon: '💰' },
    { id: 'factureDet', label: 'Lignes de facture (llx_facturedet)', icon: '📋' },
    { id: 'factures', label: 'Factures (llx_facture)', icon: '📊' },
    { id: 'societes', label: 'Tiers/Clients (llx_societe)', icon: '🏢' },
    { id: 'produits', label: 'Produits (llx_product, llx_product_price)', icon: '📦' },
    { id: 'banque', label: 'Écritures bancaires (llx_bank)', icon: '🏦' }
  ];

  const handleReset = async () => {
    const selected = Object.keys(selectedTables).filter(key => selectedTables[key]);
    if (selected.length === 0) {
      alert('⚠️ Veuillez sélectionner au moins une table à réinitialiser.');
      return;
    }

    // Avertissement sur l'ordre de suppression
    const confirmMessage = `⚠️ ATTENTION : La suppression se fait dans cet ordre :\n\n` +
      `1. Écritures bancaires\n` +
      `2. Paiements\n` +
      `3. Lignes de facture\n` +
      `4. Factures\n` +
      `5. Tiers/Clients\n` +
      `6. Produits\n\n` +
      `Tables sélectionnées :\n${selected.map(id => `  ${tablesList.find(t => t.id === id)?.icon} ${tablesList.find(t => t.id === id)?.label}`).join('\n')}\n\n` +
      `🔴 Cette action est IRREVERSIBLE !`;

    if (!window.confirm(confirmMessage)) return;

    setLoading(true);
    setProgress(0);
    setResult(null);

    try {
      const stats = await resetSelectedTables(selectedTables, (pct) => {
        setProgress(pct);
      });
      
      const successCount = stats.success || 0;
      const errorCount = stats.errors || 0;
      
      setResult({
        success: errorCount === 0,
        message: errorCount === 0
          ? `✅ Réinitialisation terminée avec succès ! ${successCount} élément(s) supprimé(s)`
          : `⚠️ Réinitialisation partielle : ${successCount} supprimé(s), ${errorCount} erreur(s)`,
        details: stats.details || {},
        errorDetails: stats.errorDetails || []
      });
    } catch (error) {
      setResult({
        success: false,
        message: `❌ Erreur lors de la réinitialisation : ${error.message}`,
        details: {},
        errorDetails: [error.message]
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleAll = (checked) => {
    const newState = {};
    Object.keys(selectedTables).forEach(key => {
      newState[key] = checked;
    });
    setSelectedTables(newState);
  };

  const isAllSelected = Object.values(selectedTables).every(v => v === true);
  const isAnySelected = Object.values(selectedTables).some(v => v === true);

  return (
    <div className="container">
      <div className="card">
        <h2>🔄 Réinitialisation des données</h2>
        
        <div style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '4px', padding: '15px', marginBottom: '20px' }}>
          <p style={{ color: '#856404', margin: 0 }}>
            <strong>⚠️ Attention :</strong> Sélectionnez les tables à réinitialiser. 
            Toutes les données seront supprimées définitivement dans l'ordre : 
            <strong> Banque → Paiements → Lignes → Factures → Tiers → Produits</strong>
          </p>
        </div>

        {/* Sélection des tables */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <h3 style={{ margin: 0 }}>📋 Tables à réinitialiser</h3>
            <label style={{ cursor: 'pointer', fontSize: '14px' }}>
              <input 
                type="checkbox" 
                checked={isAllSelected}
                onChange={(e) => toggleAll(e.target.checked)}
                style={{ marginRight: '5px' }}
              />
              {isAllSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
            </label>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {tablesList.map(table => (
              <label key={table.id} style={{ 
                display: 'flex', 
                alignItems: 'center', 
                padding: '10px', 
                border: '1px solid #ddd', 
                borderRadius: '4px',
                cursor: 'pointer',
                background: selectedTables[table.id] ? '#e8f4fd' : '#fff',
                transition: 'all 0.2s'
              }}>
                <input 
                  type="checkbox" 
                  checked={selectedTables[table.id]}
                  onChange={(e) => setSelectedTables({...selectedTables, [table.id]: e.target.checked})}
                  style={{ marginRight: '10px', width: '18px', height: '18px' }}
                />
                <span>{table.icon} {table.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Barre de progression */}
        {loading && (
          <div style={{ margin: '20px 0' }}>
            <div style={{ 
              width: '100%', 
              height: '25px', 
              background: '#f0f0f0', 
              borderRadius: '12px',
              overflow: 'hidden',
              position: 'relative',
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)'
            }}>
              <div style={{ 
                width: `${progress}%`, 
                height: '100%', 
                background: 'linear-gradient(90deg, #28a745, #20c997)',
                transition: 'width 0.5s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: '12px',
                fontWeight: 'bold'
              }}>
                {progress}%
              </div>
            </div>
            <p style={{ textAlign: 'center', marginTop: '8px', fontSize: '14px', color: '#666' }}>
              🔄 Réinitialisation en cours... {progress}%
            </p>
          </div>
        )}

        {/* Bouton de réinitialisation */}
        <div style={{ textAlign: 'center', padding: '30px 0' }}>
          <button 
            className="btn btn-danger" 
            onClick={handleReset} 
            disabled={loading || !isAnySelected}
            style={{ 
              padding: '15px 50px', 
              fontSize: '18px',
              opacity: (loading || !isAnySelected) ? 0.6 : 1,
              cursor: (loading || !isAnySelected) ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? '⏳ Réinitialisation en cours...' : '🚀 Réinitialiser les données sélectionnées'}
          </button>
          {!isAnySelected && !loading && (
            <p style={{ color: '#dc3545', fontSize: '14px', marginTop: '10px' }}>
              ⚠️ Sélectionnez au moins une table
            </p>
          )}
        </div>

        {/* Statistiques finales */}
        {result && (
          <div className="card" style={{ 
            marginTop: '20px', 
            border: `2px solid ${result.success ? '#28a745' : '#dc3545'}`, 
            background: result.success ? '#d4edda' : '#f8d7da',
            padding: '15px',
            borderRadius: '8px'
          }}>
            <h3 style={{ color: result.success ? '#155724' : '#721c24', marginTop: 0 }}>
              📊 Résultats de la réinitialisation
            </h3>
            <p style={{ color: result.success ? '#155724' : '#721c24', fontSize: '16px', fontWeight: '500' }}>
              {result.message}
            </p>
            
            {Object.keys(result.details).length > 0 && (
              <div style={{ marginTop: '15px' }}>
                <h4 style={{ marginBottom: '10px' }}>Détails par table :</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  {Object.entries(result.details).map(([table, stats]) => {
                    const tableInfo = tablesList.find(t => t.id === table);
                    const total = (stats.success || 0) + (stats.errors || 0);
                    if (total === 0) return null;
                    return (
                      <div key={table} style={{ 
                        padding: '10px', 
                        background: 'rgba(255,255,255,0.8)', 
                        borderRadius: '6px',
                        border: (stats.errors || 0) > 0 ? '1px solid #dc3545' : '1px solid #28a745'
                      }}>
                        <strong>{tableInfo?.icon} {tableInfo?.label || table}</strong>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginTop: '5px' }}>
                          <span style={{ color: '#28a745' }}>✅ {stats.success || 0} supprimé(s)</span>
                          {(stats.errors || 0) > 0 && <span style={{ color: '#dc3545' }}>❌ {stats.errors} erreur(s)</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {result.errorDetails && result.errorDetails.length > 0 && (
              <div style={{ marginTop: '15px' }}>
                <h4 style={{ color: '#721c24' }}>❌ Détails des erreurs :</h4>
                <ul style={{ color: '#721c24', paddingLeft: '20px', maxHeight: '200px', overflowY: 'auto' }}>
                  {result.errorDetails.map((d, i) => <li key={i}>{d}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Reinitialisation;