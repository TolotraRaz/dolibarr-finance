import {
  findThirdpartyByName,
  createCustomer,
  getProducts,
  createInvoice,
  createInvoiceLine,
  validateInvoice,
  getClientInvoices
} from './api';

// Connexion / auto-inscription par nom
export const loginOrRegisterClient = async (name) => {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (!trimmed) throw new Error('Le nom est obligatoire');

  let client = await findThirdpartyByName(trimmed);
  if (client) {
    return client; // client existant → login normal
  }

  // Double vérification juste avant la création, pour limiter la fenêtre
  // de concurrence (deux onglets créant le même nom en même temps)
  const recheck = await findThirdpartyByName(trimmed);
  if (recheck) {
    return recheck;
  }

  const result = await createCustomer({
    name: trimmed,
    client: 1,
    status: 1
  });
  const newId = (result && typeof result === 'object') ? result.id : result;
  return { id: newId, name: trimmed };
};

export const fetchProducts = async () => {
  const products = await getProducts();
  return Array.isArray(products) ? products : [];
};

const formatDateISO = (date) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export const todayISO = () => formatDateISO(new Date());

export const addDaysISO = (days) => {
  const nbJours = Number(days);
  if (!Number.isInteger(nbJours) || nbJours <= 0) {
    throw new Error('Nombre de jours invalide');
  }
  const d = new Date();
  d.setDate(d.getDate() + nbJours);
  return formatDateISO(d);
};

// Créer une facture Dolibarr à partir du panier
export const createInvoiceFromCart = async (client, cartItems, dateLimReglement) => {
  const invoiceData = {
    date: todayISO(),
    date_lim_reglement: dateLimReglement,
    socid: client.id,
    type: 0
  };

  const result = await createInvoice(invoiceData);
  // Dolibarr renvoie l'ID brut (nombre), pas un objet — on normalise ici
  const invoiceId = (result && typeof result === 'object') ? result.id : result;

  for (const item of cartItems) {
    await createInvoiceLine(invoiceId, {
      desc: item.label,
      qty: item.quantite,
      subprice: parseFloat(item.selectedPrice ?? item.price),
      tva_tx: parseFloat(item.tva || 0),
      ref: item.ref,
      fk_product: item.id,
      remise_percent: parseFloat(item.remise || 0)
    });
  }

  await validateInvoice(invoiceId);
  return { id: invoiceId };
};

// Factures non totalement payées d'un client
export const getClientUnpaidInvoices = async (socid) => {
  const invoices = await getClientInvoices(socid);
  return invoices.filter(inv => inv.paye === 0 || inv.paye === '0');
};

//Suivi des factures en cours de règlementcôté client
const PENDING_KEY = 'peinding_invoice_ids';

export const addPendingInvoice = (invoiceId) => {
  try {
    const stored = JSON.parse(sessionStorage.getItem(PENDING_KEY) || '[]');
    if(!stored.includes(String(invoiceId))){
      stored.push(String(invoiceId));
      sessionStorage.setItem(PENDING_KEY, JSON.stringify(stored));
    }
  } catch {

  }
};

export const getPendingInvoiceIds = () => {
  try {
    return JSON.parse(sessionStorage.getItem(PENDING_KEY) || '[]');
  } catch {
    return [];
  }
};

export const removePendingInvoice = (invoiceId) => {
  try{
    const stored = JSON.parse(sessionStorage.getItem(PENDING_KEY) || '[]');
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(stored.filter(id => id !== String(invoiceId))));
  } catch {

  }
};