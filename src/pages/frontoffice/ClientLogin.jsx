import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginOrRegisterClient } from '../../services/frontofficeService';
import { useClient } from '../../context/ClientContext';

const ClientLogin = () => {
  const navigate = useNavigate();
  const { login } = useClient();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Veuillez saisir votre nom');
      return;
    }
    try {
      setLoading(true);
      setError('');
      const client = await loginOrRegisterClient(name);
      login({ id: client.id, name: client.name || name });
      navigate('/boutique/produits');
    } catch (err) {
      setError("Erreur lors de la connexion : " + (err.response?.data?.error?.message || err.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <div className="card" style={{ maxWidth: '400px', margin: '80px auto', textAlign: 'center' }}>
        <h2>Bienvenue</h2>
        <p style={{ color: '#666', marginBottom: '20px' }}>
          Saisissez votre nom pour accéder à la boutique. Si vous êtes nouveau, votre compte sera créé automatiquement.
        </p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Votre nom</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Rakoto"
              autoFocus
            />
          </div>
          {error && <p style={{ color: '#dc3545' }}>{error}</p>}
          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '15px' }} disabled={loading}>
            {loading ? 'Connexion...' : 'Continuer'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ClientLogin;