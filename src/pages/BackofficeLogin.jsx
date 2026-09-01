import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const BackofficeLogin = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [code, setCode] = useState('1234'); // valeur par défaut pré-remplie
  const [error, setError] = useState('');

  const expectedCode = process.env.REACT_APP_BACKOFFICE_CODE;
  const from = location.state?.from?.pathname || '/dashboard';

  const handleSubmit = (e) => {
    e.preventDefault();
  
    if (code === expectedCode) {
      localStorage.setItem('backoffice_auth', JSON.stringify({
        auth: true,
        timestamp: Date.now()
      }));
      setError('');
      navigate(from, { replace: true });
    } else {
      setError('Code incorrect. Veuillez réessayer.');
    }
  };

  return (
    <div className="container">
      <div className="card" style={{ maxWidth: '400px', margin: '80px auto', textAlign: 'center' }}>
        <h2>Accès Backoffice</h2>
        <p style={{ color: '#666', marginBottom: '20px' }}>
          Veuillez saisir le code d'accès pour continuer.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Code d'accès</label>
            <input
              type="password"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoFocus
              style={{ textAlign: 'center', fontSize: '18px', letterSpacing: '4px' }}
            />
          </div>

          {error && (
            <p style={{ color: '#dc3545', marginTop: '10px' }}>{error}</p>
          )}

          <button type="submit" className="btn btn-primary" style={{ marginTop: '20px', width: '100%' }}>
            Accéder
          </button>
        </form>
      </div>
    </div>
  );
};

export default BackofficeLogin;