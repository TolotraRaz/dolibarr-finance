import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Importation from './pages/Importation';
import Visualisation from './pages/Visualisation';
import Dashboard from './pages/Dashboard';
import Reinitialisation from './pages/Reinitialisation';
import ConfigurationRemise from './pages/ConfigurationRemise';
import ListeRemboursement from './pages/ListeRemboursement';
import BackofficeLogin from './pages/BackofficeLogin';
import ProtectedRoute from './components/ProtectedRoute';

import ClientLogin from './pages/frontoffice/ClientLogin';
import Produits from './pages/frontoffice/Produits';
import Panier from './pages/frontoffice/Panier';
import Paiement from './pages/frontoffice/Paiement';
import ProtectedClientRoute from './components/ProtectedClientRoute';
import { ClientProvider } from './context/ClientContext';
import { CartProvider } from './context/CartContext';
import GenererPaiement from './pages/frontoffice/GenererPaiement';

function App() {
  return (
    <ClientProvider>
      <CartProvider>
        <Router>
          <Layout>
            <Routes>
              {/* Backoffice */}
              <Route path="/login" element={<BackofficeLogin />} />
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/importation" element={<ProtectedRoute><Importation /></ProtectedRoute>} />
              <Route path="/visualisation" element={<Visualisation />} />
              <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/reinitialisation" element={<ProtectedRoute><Reinitialisation /></ProtectedRoute>} />
              <Route path="/configuration-remise" element={<ProtectedRoute><ConfigurationRemise /></ProtectedRoute>} />
              <Route path="/liste-remboursement" element={<ProtectedRoute><ListeRemboursement /></ProtectedRoute>} />

              {/* Frontoffice */}
              <Route path="/client-login" element={<ClientLogin />} />
              <Route path="/boutique/produits" element={<ProtectedClientRoute><Produits /></ProtectedClientRoute>} />
              <Route path="/boutique/panier" element={<ProtectedClientRoute><Panier /></ProtectedClientRoute>} />
              <Route path="/boutique/paiement" element={<ProtectedClientRoute><Paiement /></ProtectedClientRoute>} />
              <Route path="/boutique/generer-paiement" element={<ProtectedClientRoute><GenererPaiement /></ProtectedClientRoute>} />


            </Routes>
          </Layout>
        </Router>
      </CartProvider>
    </ClientProvider>
  );
}

export default App;