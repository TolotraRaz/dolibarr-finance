import axios from 'axios';

const API_URL = process.env.REACT_APP_DOLIBARR_API_URL;
const API_KEY = process.env.REACT_APP_DOLIBARR_API_KEY;

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'DOLAPIKEY': API_KEY,
    'Content-Type': 'application/json'
  }
});

// Intercepteur pour gérer les erreurs
api.interceptors.response.use(
  response => response,
  error => {
    console.error('API Error:', JSON.stringify(error.response?.data, null, 2) || error.message);
    throw error;
  }
);

// Fonctions pour les factures
export const getInvoices = async () => {
  try {
    const response = await api.get('/invoices');
    return response.data;
  } catch (error) {
    throw error;
  }
};

export const getInvoicesById = async (invoiceId) =>{
  try{
    const response = await api.get(`/invoices/${invoiceId}`);
    return response.data;
  } catch (error) {
    throw error;
  }
};

export const createInvoice = async (invoiceData) => {
  try {
    const response = await api.post('/invoices', invoiceData);
    return response.data;
  } catch (error) {
    throw error;
  }
};

// Fonctions pour les lignes de facture
export const createInvoiceLine = async (invoiceId, lineData) => {
  try {
    const response = await api.post(`/invoices/${invoiceId}/lines`, lineData);
    return response.data;
  } catch (error) {
    throw error;
  }
};

// Fonctions pour les paiements
// ========== PAIEMENTS (version corrigée) ==========
export const createPayment = async (invoiceId, paymentData) => {
  try {
    const body = {
      arrayofamounts: {
        [invoiceId]: {
          amount: String(paymentData.amount),
          multicurrency_amount: ''
        }
      },
      datepaye: paymentData.datepaye,
      paymentid: paymentData.paymentid,
      closepaidinvoices: paymentData.closepaidinvoices || 'no',
      accountid: paymentData.accountid
    };
    
    const response = await api.post('/invoices/paymentsdistributed', body);
    return response.data;
  } catch (error) {
    console.error(' Erreur createPayment:', error.response?.data || error.message);
    throw error;
  }
};

// Remplacer searchInvoicesByRef par une récupération complète + filtre côté client
export const getAllInvoices = async () => {
  try {
    const response = await api.get('/invoices', {
      params: { limit: 1000 } // augmenter la limite par défaut (souvent 100) pour tout récupérer
    });
    return response.data;
  } catch (error) {
    throw error;
  }
};

export const validateInvoice = async (invoiceId) => {
  try {
    const response = await api.post(`/invoices/${invoiceId}/validate`);
    return response.data;
  } catch (error) {
    throw error;
  }
};

// Repasser une facture en "non payée"
export const setInvoiceToUnpaid = async (invoiceId) => {
  try {
    const response = await api.post(`/invoices/${invoiceId}/settounpaid`);
    return response.data;
  } catch (error) {
    throw error;
  }
};

// Récupérer les paiements liés à une facture
export const getInvoicePayments = async (invoiceId) => {
  try {
    const response = await api.get(`/invoices/${invoiceId}/payments`);
    return response.data;
  } catch (error) {
    // Si aucune payment trouvé, Dolibarr renvoie parfois une 404 -> traiter comme liste vide
    if (error.response?.status === 404) return [];
    throw error;
  }
};

// Récupérer les lignes d'une facture (produits vendus)
export const getInvoiceLines = async (invoiceId) => {
  try {
    const response = await api.get(`/invoices/${invoiceId}/lines`);
    return response.data;
  } catch (error) {
    if (error.response?.status === 404) return [];
    throw error;
  }
};

// Supprimer une facture
export const deleteInvoice = async (invoiceId) => {
  try {
    const response = await api.delete(`/invoices/${invoiceId}`);
    return response.data;
  } catch (error) {
    throw error;
  }
};

// Supprimer un tiers
export const deleteThirdparty = async (thirdpartyId) => {
  try {
    const response = await api.delete(`/thirdparties/${thirdpartyId}`);
    return response.data;
  } catch (error) {
    throw error;
  }
};

// Supprimer un paiement
export const deletePayment = async (paymentId) => {
  try {
    const response = await api.delete(`/invoices/payments/${paymentId}`);
    return response.data;
  } catch (error) {
    throw error;
  }
};

//  Fonction pour les comptes bancaires 
export const getBankAccounts = async () => {
  try {
    const response = await api.get('/bankaccounts');
    return response.data;
  } catch (error) {
    throw error;
  }
};

// Fonctions pour les tiers (clients)
export const getCustomers = async () => {
  try {
    const response = await api.get('/thirdparties');
    return response.data;
  } catch (error) {
    throw error;
  }
};

export const createCustomer = async (customerData) => {
  try {
    const response = await api.post('/thirdparties', customerData);
    return response.data;
  } catch (error) {
    throw error;
  }
};

// Normalisation : trim, espaces multiples, minuscule, accents retirés
const normalizeName = (str) =>
  str
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
    
// Rechercher un tiers par nom exact (recherche côté client pour rester compatible toutes versions Dolibarr)
export const findThirdpartyByName = async (name) => {
  try {
    const response = await api.get('/thirdparties', { params: { limit: 1000 } });
    const list = Array.isArray(response.data) ? response.data : [];
    const target = normalizeName(name);
    return list.find(t => normalizeName(t.name || '') === target) || null;
  } catch (error) {
    throw error;
  }
};

// Rechercher un tiers par son code_client (recherche côté client, car ce n'est pas un champ standard indexé par l'API Dolibarr)
export const findThirdpartyByCode = async (code_client) => {
  try {
    const response = await api.get('/thirdparties', { params: { limit: 1000 } });
    const list = Array.isArray(response.data) ? response.data : [];
    return list.find(t => t.code_client?.trim() === code_client?.trim()) || null;
  } catch (error) {
    console.error('Erreur findThirdpartyByCode:', error.message);
    return null;
  }
};

// Récupérer le catalogue produits
export const getProducts = async () => {
  try {
    const response = await api.get('/products', { 
      params: { limit: 1000, includemultiprices: 1 } 
    });
    return response.data;
  } catch (error) {
    throw error;
  }
};

// Récupérer les factures d'un client (filtrage côté client à partir de getAllInvoices)
export const getClientInvoices = async (socid) => {
  try {
    const response = await api.get('/invoices', { params: { limit: 1000 } });
    const list = Array.isArray(response.data) ? response.data : [];
    return list.filter(inv => String(inv.socid) === String(socid));
  } catch (error) {
    throw error;
  }
};

// ========== PRODUITS ==========

// Récupérer un produit par sa référence
export const getProductByRef = async (ref) => {
  try {
    const response = await api.get(`/products/ref/${encodeURIComponent(ref)}`);
    return response.data;
  } catch (error) {
    // 404 = produit non trouvé (c'est normal)
    if (error.response?.status === 404) {
      console.log(` Produit ${ref} non trouvé`);
      return null;
    }
    // Autres erreurs
    console.error(` Erreur getProductByRef:`, error.message);
    return null;
  }
};

// Créer un produit
export const createProduct = async (productData) => {
  try {
    const response = await api.post('/products', productData);
    return response.data;
  } catch (error) {
    console.error(' Erreur createProduct:', error.response?.data || error.message);
    throw error;
  }
};

// Récupérer tous les produits (alternative)
export const getAllProducts = async () => {
  try {
    const response = await api.get('/products', { params: { limit: 1000 } });
    return Array.isArray(response.data) ? response.data : [];
  } catch (error) {
    console.error(' Erreur getAllProducts:', error);
    return [];
  }
};

//  Ajouter un prix de vente à un produit
export const addSellingPrice = async (productId, priceData) => {
  try {
    // Utiliser l'endpoint /products/{id}/selling_multiprices/per_customer
    // ou /products/{id}/selling_multiprices/per_quantity
    // Selon le type de prix que vous voulez ajouter
    
    const response = await api.post(`/products/${productId}/selling_multiprices/per_customer`, {
      price: priceData.price,
      price_ttc: priceData.price_ttc,
      price_level: priceData.price_level || 0,
      customer_id: 0  // 0 = prix par défaut pour tous les clients
    });
    return response.data;
  } catch (error) {
    console.error(' Erreur addSellingPrice:', error.response?.data || error.message);
    throw error;
  }
};

//  Option 2 : Utiliser l'endpoint /products/{id}/purchase_prices pour les prix d'achat
export const addPurchasePrice = async (productId, priceData) => {
  try {
    const response = await api.post(`/products/${productId}/purchase_prices`, {
      price: priceData.price,
      price_ttc: priceData.price_ttc,
      date_price: priceData.datec || new Date().toISOString().split('T')[0]
    });
    return response.data;
  } catch (error) {
    console.error(' Erreur addPurchasePrice:', error.response?.data || error.message);
    throw error;
  }
};

// Réinitialisation des données
export const resetData = async () => {
  try {
    const response = await api.delete('/setup/emptyDatabase', {
      params: { target: 'all' }
    });
    return response.data;
  } catch (error) {
    throw error;
  }
};

export default api;