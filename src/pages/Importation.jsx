import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { parseCSV } from '../services/importService';

const Importation = () => {
  const navigate = useNavigate();
  const [files, setFiles] = useState({
    factures: null,
    details: null,
    paiements: null
  });
  const [fileNames, setFileNames] = useState({
    factures: '',
    details: '',
    paiements: ''
  });
  const [csvData, setCsvData] = useState({
    factures: null,
    details: null,
    paiements: null
  });

  const handleFileChange = (type, event) => {
    const file = event.target.files[0];
    if (file) {
      setFiles(prev => ({ ...prev, [type]: file }));
      setFileNames(prev => ({ ...prev, [type]: file.name }));
      
      // Parser le fichier immédiatement
      parseCSV(file)
        .then(data => {
          setCsvData(prev => ({ ...prev, [type]: data }));
        })
        .catch(error => {
          console.error(`Erreur de parsing ${type}:`, error);
        });
    }
  };

  const handleVisualiser = () => {
    // Vérifier que tous les fichiers sont chargés
    if (!files.factures || !files.details || !files.paiements) {
      alert('Veuillez importer les 3 fichiers CSV');
      return;
    }

    // Stocker les données dans sessionStorage pour les récupérer dans la page de visualisation
    sessionStorage.setItem('facturesData', JSON.stringify(csvData.factures));
    sessionStorage.setItem('detailsData', JSON.stringify(csvData.details));
    sessionStorage.setItem('paiementsData', JSON.stringify(csvData.paiements));
    
    navigate('/visualisation');
  };

  return (
    <div className="container">
      <div className="card">
        <h2>Importation des fichiers CSV</h2>
        <p style={{ color: '#666', marginBottom: '30px' }}>
          Veuillez importer les 3 fichiers CSV dans l'ordre suivant : Factures, Détails des factures, Paiements
        </p>

        <div className="grid-2">
          {/* Formulaire 1: Factures */}
          <div className="form-group">
            <label>Fichier des factures</label>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => handleFileChange('factures', e)}
            />
            {fileNames.factures && (
              <small style={{ color: '#0066cc', display: 'block', marginTop: '5px' }}>
                {fileNames.factures}
              </small>
            )}
            {csvData.factures && (
              <small style={{ color: '#28a745', display: 'block', marginTop: '5px' }}>
                {csvData.factures.length} lignes chargées
              </small>
            )}
          </div>

          {/* Formulaire 2: Détails factures */}
          <div className="form-group">
            <label>Fichier des détails des factures</label>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => handleFileChange('details', e)}
            />
            {fileNames.details && (
              <small style={{ color: '#0066cc', display: 'block', marginTop: '5px' }}>
                {fileNames.details}
              </small>
            )}
            {csvData.details && (
              <small style={{ color: '#28a745', display: 'block', marginTop: '5px' }}>
                {csvData.details.length} lignes chargées
              </small>
            )}
          </div>

          {/* Formulaire 3: Paiements */}
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Fichier des paiements</label>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => handleFileChange('paiements', e)}
            />
            {fileNames.paiements && (
              <small style={{ color: '#0066cc', display: 'block', marginTop: '5px' }}>
              {fileNames.paiements}
              </small>
            )}
            {csvData.paiements && (
              <small style={{ color: '#28a745', display: 'block', marginTop: '5px' }}>
                {csvData.paiements.length} lignes chargées
              </small>
            )}
          </div>
        </div>

        <div style={{ marginTop: '30px', textAlign: 'center' }}>
          <button 
            className="btn btn-primary" 
            onClick={handleVisualiser}
            disabled={!files.factures || !files.details || !files.paiements}
          >
          Visualiser les données
          </button>
        </div>
      </div>

      <div className="card" style={{ background: '#f8f9fa', border: '2px dashed #0066cc' }}>
        <h3 style={{ color: '#0066cc' }}>Format attendu des fichiers CSV</h3>
        <div className="grid-2">
          <div>
            <h4>Factures</h4>
            <ul style={{ color: '#666', fontSize: '14px' }}>
              <li>num_facture</li>
              <li>date_facture (JJ/MM/AAAA)</li>
              <li>date_limite_reglement (JJ/MM/AAAA)</li>
              <li>code_client</li>
              <li>nom_client</li>
            </ul>
          </div>
          <div>
            <h4>Détails factures</h4>
            <ul style={{ color: '#666', fontSize: '14px' }}>
              <li>ref_detail</li>
              <li>num_facture</li>
              <li>ref_produit</li>
              <li>produit</li>
              <li>quantite</li>
              <li>pu_hors_Taxe</li>
              <li>taxe (ex: 20%)</li>
              <li>remise (ex: 15,50%)</li>
            </ul>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <h4>Paiements</h4>
            <ul style={{ color: '#666', fontSize: '14px' }}>
              <li>ref_detail</li>
              <li>date_reglement (JJ/MM/AAAA)</li>
              <li>caisse</li>
              <li>montant</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Importation;