import axios from 'axios';

const API_URL = process.env.REACT_APP_DISCOUNT_API_URL;

const discountApi = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' }
});

discountApi.interceptors.response.use(
  response => response,
  error => {
    console.error('Discount API Error:', error.response?.data || error.message);
    throw error;
  }
);

export const getDiscountRules = async () => {
  const response = await discountApi.get('/discount-rules');
  return response.data;
};

export const createDiscountRule = async (rule) => {
  const response = await discountApi.post('/discount-rules', rule);
  return response.data;
};

export const updateDiscountRule = async (id, rule) => {
  const response = await discountApi.put(`/discount-rules/${id}`, rule);
  return response.data;
};

export const deleteDiscountRule = async (id) => {
  const response = await discountApi.delete(`/discount-rules/${id}`);
  return response.data;
};

export const calculateDiscount = async (jours) => {
  const response = await discountApi.get(`/discount-rules/calculate/${jours}`);
  return response.data;
};

// --- Suivi des règlements (remises) ---

export const createReglement = async (reglement) => {
  const response = await discountApi.post('/reglements', reglement);
  return response.data;
};

export const getReglements = async () => {
  const response = await discountApi.get('/reglements');
  return response.data;
};

export const getReglementsForFacture = async (invoiceId) => {
  const response = await discountApi.get(`/reglements/facture/${invoiceId}`);
  return response.data;
};

// --- Échéanciers de paiement ---

export const createEcheancier = async (echeancier) => {
  const response = await discountApi.post('/echeanciers', echeancier);
  return response.data;
};

export const getEcheanciersForFacture = async (invoiceId) => {
  const response = await discountApi.get(`/echeanciers/facture/${invoiceId}`);
  return response.data;
};

export const payerEcheance = async (echeanceId, datePaiement) => {
  const response = await discountApi.put(`/echeances/${echeanceId}/payer`, { date_paiement: datePaiement });
  return response.data;
};

// --- Remboursements ---

export const createRemboursement = async (remboursement) => {
  const response = await discountApi.post('/remboursements', remboursement);
  return response.data;
};

export const getRemboursements = async (statut) => {
  const response = await discountApi.get('/remboursements', { params: statut ? { statut } : {} });
  return response.data;
};

export const annulerRemboursement = async (id, data) => {
  const response = await discountApi.put(`/remboursements/${id}/annuler`, data);
  return response.data;
};

// --- Historique des prix produits ---

export const saveProductPrice = async (priceData) => {
  const response = await discountApi.post('/product-prices', priceData);
  return response.data;
};

export const getProductPriceHistory = async (ref) => {
  const response = await discountApi.get(`/product-prices/${ref}`);
  return response.data; // [{pu_ht, taxe}, ...]
};

export default discountApi;