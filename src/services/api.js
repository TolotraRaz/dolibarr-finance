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

// ========== FACTURES ==========

export const getInvoices = async () => {
  try {
    const response = await api.get('/invoices');
    return response.data;
  } catch (error) {
    throw error;
  }
};

export const getInvoicesById = async (invoiceId) => {
  try {
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

export const getAllInvoices = async () => {
  try {
    const response = await api.get('/invoices', {
      params: { limit: 1000 }
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

export const setInvoiceToUnpaid = async (invoiceId) => {
  try {
    const response = await api.post(`/invoices/${invoiceId}/settounpaid`);
    return response.data;
  } catch (error) {
    throw error;
  }
};

export const deleteInvoice = async (invoiceId) => {
  try {
    const response = await api.delete(`/invoices/${invoiceId}`);
    return response.data;
  } catch (error) {
    throw error;
  }
};

// ========== LIGNES DE FACTURE ==========

export const createInvoiceLine = async (invoiceId, lineData) => {
  try {
    const response = await api.post(`/invoices/${invoiceId}/lines`, lineData);
    return response.data;
  } catch (error) {
    throw error;
  }
};

export const getInvoiceLines = async (invoiceId) => {
  try {
    const response = await api.get(`/invoices/${invoiceId}/lines`);
    return response.data;
  } catch (error) {
    if (error.response?.status === 404) return [];
    throw error;
  }
};

export const deleteInvoiceLine = async (invoiceId, lineId) => {
  try {
    const response = await api.delete(`/invoices/${invoiceId}/lines/${lineId}`);
    return response.data;
  } catch (error) {
    throw error;
  }
};

export const setInvoiceToDraft = async (invoiceId) => {
  try {
    const response = await api.post(`/invoices/${invoiceId}/settodraft`);
    return response.data;
  } catch (error) {
    throw error;
  }
};

// ========== PAIEMENTS ==========

// Récupérer les paiements liés à une facture
export const getInvoicePayments = async (invoiceId) => {
  try {
    const response = await api.get(`/invoices/${invoiceId}/payments`);
    return response.data;
  } catch (error) {
    if (error.response?.status === 404) return [];
    throw error;
  }
};

// Supprimer un paiement - Endpoint: DELETE /paiements/{id}
export const deletePayment = async (paymentId) => {
  try {
    // Vérifier que l'ID est valide
    if (!paymentId || paymentId === 'undefined') {
      throw new Error('ID de paiement invalide');
    }
    const response = await api.delete(`/paiements/${paymentId}`);
    return response.data;
  } catch (error) {
    throw error;
  }
};

// Créer un paiement
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
    console.error('❌ Erreur createPayment:', error.response?.data || error.message);
    throw error;
  }
};

// ========== TIERS / CLIENTS ==========

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

export const deleteThirdparty = async (thirdpartyId) => {
  try {
    const response = await api.delete(`/thirdparties/${thirdpartyId}`);
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

// ========== PRODUITS ==========

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

export const getProductStock = async (productId) => {
  try {
    const response = await api.get(`/products/${productId}/stock`);
    return response.data;
  } catch (error) {
    if (error.response?.status === 404) return null;
    throw error;
  }
};

export const getProductByRef = async (ref) => {
  try {
    const response = await api.get(`/products/ref/${encodeURIComponent(ref)}`);
    return response.data;
  } catch (error) {
    if (error.response?.status === 404) {
      console.log(`Produit ${ref} non trouvé`);
      return null;
    }
    console.error(`Erreur getProductByRef:`, error.message);
    return null;
  }
};

export const createProduct = async (productData) => {
  try {
    const response = await api.post('/products', productData);
    return response.data;
  } catch (error) {
    console.error('Erreur createProduct:', error.response?.data || error.message);
    throw error;
  }
};

export const getAllProducts = async () => {
  try {
    const response = await api.get('/products', { params: { limit: 1000 } });
    return Array.isArray(response.data) ? response.data : [];
  } catch (error) {
    console.error('Erreur getAllProducts:', error);
    return [];
  }
};

export const deleteProduct = async (productId) => {
  try {
    const response = await api.delete(`/products/${productId}`);
    return response.data;
  } catch (error) {
    throw error;
  }
};

export const addSellingPrice = async (productId, priceData) => {
  try {
    const response = await api.post(`/products/${productId}/selling_multiprices/per_customer`, {
      price: priceData.price,
      price_ttc: priceData.price_ttc,
      price_level: priceData.price_level || 0,
      customer_id: 0
    });
    return response.data;
  } catch (error) {
    console.error('Erreur addSellingPrice:', error.response?.data || error.message);
    throw error;
  }
};

export const addPurchasePrice = async (productId, priceData) => {
  try {
    const response = await api.post(`/products/${productId}/purchase_prices`, {
      price: priceData.price,
      price_ttc: priceData.price_ttc,
      date_price: priceData.datec || new Date().toISOString().split('T')[0]
    });
    return response.data;
  } catch (error) {
    console.error('Erreur addPurchasePrice:', error.response?.data || error.message);
    throw error;
  }
};

// ========== BANQUE ==========

export const getBankAccounts = async () => {
  try {
    const response = await api.get('/bankaccounts');
    return response.data;
  } catch (error) {
    if (error.response?.status === 404) return [];
    throw error;
  }
};

// Récupère le détail d'une ligne bancaire (permet de retrouver son compte parent)
export const getBankLineDetail = async (lineId) => {
  try {
    const response = await api.get(`/bankaccounts/lines/${lineId}`);
    return response.data;
  } catch (error) {
    if (error.response?.status === 404) return null;
    throw error;
  }
};

export const getBankLines = async (accountId) => {
  try {
    const response = await api.get(`/bankaccounts/${accountId}/lines`);
    return response.data;
  } catch (error) {
    if (error.response?.status === 404) return [];
    throw error;
  }
};

export const deleteBankLine = async (accountId, lineId) => {
  try {
    const response = await api.delete(`/bankaccounts/${accountId}/lines/${lineId}`);
    return response.data;
  } catch (error) {
    throw error;
  }
};

// ========== FACTURES CLIENTS ==========

export const getClientInvoices = async (socid) => {
  try {
    const response = await api.get('/invoices', { params: { limit: 1000 } });
    const list = Array.isArray(response.data) ? response.data : [];
    return list.filter(inv => String(inv.socid) === String(socid));
  } catch (error) {
    throw error;
  }
};

// ========== RÉINITIALISATION COMPLÈTE (optionnelle) ==========

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