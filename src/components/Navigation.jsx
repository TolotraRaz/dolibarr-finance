import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useClient } from '../context/ClientContext';

const Navigation = () => {
  const location = useLocation();
  const { client, logout } = useClient();

  const isActive = (path) => {
    return location.pathname === path ? 'active' : '';
  };

  const isFrontoffice = location.pathname.startsWith('/boutique') || location.pathname === '/client-login';

  const handleClientLogout = () => {
    logout();
    window.location.href = '/client-login';
  };

  if (isFrontoffice) {
    return (
      <nav className="nav">
        <div className="nav-container">
          <Link to="/boutique/produits" className="nav-brand">
            NewApp Boutique
          </Link>
          <div className="nav-links">
            <Link to="/boutique/produits" className={isActive('/boutique/produits')}>
              Produits
            </Link>
            <Link to="/boutique/panier" className={isActive('/boutique/panier')}>
              Panier
            </Link>
            <Link to="/boutique/paiement" className={isActive('/boutique/paiement')}>
              Paiement
            </Link>
            <Link to="/boutique/generer-paiement" className={isActive('/boutique/paiement')}>
              Generer Paiement
            </Link>
            
            {client && (
              <button
                onClick={handleClientLogout}
                className="btn btn-secondary"
                style={{ marginLeft: '10px', padding: '6px 12px', fontSize: '14px' }}
              >
                Déconnexion ({client.name})
              </button>
            )}
          </div>
        </div>
      </nav>
    );
  }

  return (
    <nav className="nav">
      <div className="nav-container">
        <Link to="/dashboard" className="nav-brand">
          NewApp
        </Link>
        <div className="nav-links">
          <Link to="/importation" className={isActive('/importation')}>
            Importer
          </Link>
          <Link to="/dashboard" className={isActive('/dashboard')}>
            Dashboard
          </Link>
          <Link to="/reinitialisation" className={isActive('/reinitialisation')}>
            Réinitialiser
          </Link>
          <Link to="/configuration-remise" className={isActive('/configuration-remise')}>
            Config. Remises
          </Link>
          <Link to="/liste-remboursement" className={isActive('/liste-remboursement')}>
            Remboursements
          </Link>
          <Link to="/client-login" className={isActive('/client-login')}>
            Espace Client
          </Link>
          <button
            onClick={() => {
              sessionStorage.removeItem('backoffice_auth');
              window.location.href = '/login';
            }}
            className="btn btn-secondary"
            style={{ marginLeft: '10px', padding: '6px 12px', fontSize: '14px' }}
          >
            Déconnexion
          </button>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;