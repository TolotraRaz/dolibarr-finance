const sqlite = require('node:sqlite');

// Créer ou ouvrir la base de données
const db = new sqlite.DatabaseSync('discounts.db');

// Créer la table des règles de remise
db.exec(`
  CREATE TABLE IF NOT EXISTS discount_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    jours_min INTEGER NOT NULL,
    jours_max INTEGER,
    pourcentage REAL NOT NULL,
    ordre INTEGER NOT NULL,
    jour_debut INTEGER,
    jour_fin INTEGER
  )
`);

// Migration pour les bases déjà existantes
const existingColumns = db.prepare("PRAGMA table_info(discount_rules)").all();
const columnNames = existingColumns.map(c => c.name);

if (!columnNames.includes('jour_debut')) {
  db.exec('ALTER TABLE discount_rules ADD COLUMN jour_debut INTEGER');
  console.log('Colonne jour_debut ajoutée à discount_rules');
}
if (!columnNames.includes('jour_fin')) {
  db.exec('ALTER TABLE discount_rules ADD COLUMN jour_fin INTEGER');
  console.log('Colonne jour_fin ajoutée à discount_rules');
}

// Nettoyage des anciennes colonnes date_debut/date_fin si elles existent (essai non bloquant)
if (columnNames.includes('date_debut')) {
  try {
    db.exec('ALTER TABLE discount_rules DROP COLUMN date_debut');
    db.exec('ALTER TABLE discount_rules DROP COLUMN date_fin');
    console.log('Anciennes colonnes date_debut/date_fin supprimées');
  } catch (e) {
    console.log('Colonnes date_debut/date_fin conservées (non supprimées), inoffensives car inutilisées.');
  }
}

// Table de suivi des règlements (facture payée en totalité côté Dolibarr,
// mais avec une remise "gardée de côté" trackée ici pour le reporting)
db.exec(`
  CREATE TABLE IF NOT EXISTS reglements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id TEXT NOT NULL,
    invoice_ref TEXT,
    montant_original REAL NOT NULL,
    montant_paye_reel REAL NOT NULL,
    montant_remise REAL NOT NULL DEFAULT 0,
    pourcentage_remise REAL DEFAULT 0,
    date_paiement TEXT,
    date_creation TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);
const reglementColumns = db.prepare("PRAGMA table_info(reglements)").all();
const reglementColumnNames = reglementColumns.map(c => c.name);

if (!reglementColumnNames.includes('montant_couvert')) {
  db.exec('ALTER TABLE reglements ADD COLUMN montant_couvert REAL DEFAULT 0');
  console.log('Colonne montant_couvert ajoutée à reglements');
}
if (!reglementColumnNames.includes('montant_depassement')) {
  db.exec('ALTER TABLE reglements ADD COLUMN montant_depassement REAL DEFAULT 0');
  console.log('Colonne montant_depassement ajoutée à reglements');
}

// ========== TABLE DES ÉCHANCIERS DE PAIEMENT ==========
db.exec(`
  CREATE TABLE IF NOT EXISTS echeanciers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id TEXT NOT NULL,
    invoice_ref TEXT,
    montant_total REAL NOT NULL,
    nombre_paiements INTEGER NOT NULL,
    jours_intervalle INTEGER NOT NULL,
    date_debut TEXT NOT NULL,
    date_creation TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

// ========== TABLE DES ÉCHÉANCES INDIVIDUELLES ==========
db.exec(`
  CREATE TABLE IF NOT EXISTS echeances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    echeancier_id INTEGER NOT NULL,
    numero INTEGER NOT NULL,
    date_echeance TEXT NOT NULL,
    montant REAL NOT NULL,
    statut TEXT NOT NULL DEFAULT 'en_attente',
    date_paiement TEXT,
    FOREIGN KEY (echeancier_id) REFERENCES echeanciers(id)
  )
`);

// Migration pour les colonnes manquantes dans echeanciers
const echeancierColumns = db.prepare("PRAGMA table_info(echeanciers)").all();
const echeancierColumnNames = echeancierColumns.map(c => c.name);

// Vérifier si la colonne description existe (pour compatibilité future)
if (!echeancierColumnNames.includes('description')) {
  try {
    db.exec('ALTER TABLE echeanciers ADD COLUMN description TEXT');
    console.log('Colonne description ajoutée à echeanciers');
  } catch (e) {
    console.log('Impossible d\'ajouter la colonne description à echeanciers');
  }
}

// Migration pour les colonnes manquantes dans echeances
const echeanceColumns = db.prepare("PRAGMA table_info(echeances)").all();
const echeanceColumnNames = echeanceColumns.map(c => c.name);

if (!echeanceColumnNames.includes('montant_initial')) {
  try {
    db.exec('ALTER TABLE echeances ADD COLUMN montant_initial REAL');
    console.log('Colonne montant_initial ajoutée à echeances');
  } catch (e) {
    console.log('Impossible d\'ajouter la colonne montant_initial à echeances');
  }
}

if (!echeanceColumnNames.includes('montant_paye')) {
  try {
    db.exec('ALTER TABLE echeances ADD COLUMN montant_paye REAL DEFAULT 0');
    console.log('Colonne montant_paye ajoutée à echeances');
  } catch (e) {
    console.log('Impossible d\'ajouter la colonne montant_paye à echeances');
  }
}

if (!echeanceColumnNames.includes('commentaire')) {
  try {
    db.exec('ALTER TABLE echeances ADD COLUMN commentaire TEXT');
    console.log('Colonne commentaire ajoutée à echeances');
  } catch (e) {
    console.log('Impossible d\'ajouter la colonne commentaire à echeances');
  }
}

// Création d'index pour optimiser les requêtes
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_echeanciers_invoice_id ON echeanciers(invoice_id);
  CREATE INDEX IF NOT EXISTS idx_echeances_echeancier_id ON echeances(echeancier_id);
  CREATE INDEX IF NOT EXISTS idx_echeances_statut ON echeances(statut);
  CREATE INDEX IF NOT EXISTS idx_echeances_date_echeance ON echeances(date_echeance);
`);

// Fonction pour initialiser les données par défaut
function initializeDefaultRules() {
  const count = db.prepare('SELECT COUNT(*) as count FROM discount_rules').get();
  
  if (count.count === 0) {
    const insert = db.prepare(`
      INSERT INTO discount_rules (label, jours_min, jours_max, pourcentage, ordre, jour_debut, jour_fin)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    // Règles par défaut sans restriction de jour
    insert.run('Aujourd\'hui', 0, 0, 30, 1, null, null);
    insert.run('Moins de 7 jours', 1, 7, 20, 2, null, null);
    insert.run('Moins de 15 jours', 8, 15, 15, 3, null, null);
    insert.run('Moins de 30 jours', 16, 30, 7.5, 4, null, null);
    insert.run('Plus d\'un mois', 31, null, 0, 5, null, null);
    
    console.log('Règles de remise par défaut initialisées');
  }
}

// ========== TABLE DES REMBOURSEMENTS ==========
db.exec(`
  CREATE TABLE IF NOT EXISTS remboursements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id TEXT NOT NULL,
    invoice_ref TEXT,
    montant_rembourse REAL NOT NULL,
    montant_cashback REAL NOT NULL DEFAULT 0,
    statut TEXT NOT NULL DEFAULT 'actif',
    date_remboursement TEXT DEFAULT CURRENT_TIMESTAMP,
    date_annulation TEXT
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_remboursements_invoice_id ON remboursements(invoice_id);`);

db.exec(`
  CREATE TABLE IF NOT EXISTS product_prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ref_produit TEXT NOT NULL,
    pu_ht REAL NOT NULL,
    taxe REAL DEFAULT 0,
    num_facture TEXT,
    UNIQUE(ref_produit, pu_ht)
  )
`);

// Migration : nouvelles colonnes pour le coût d'annulation et le cashback retourné
const remboursementColumns = db.prepare("PRAGMA table_info(remboursements)").all();
const remboursementColumnNames = remboursementColumns.map(c => c.name);

if (!remboursementColumnNames.includes('cashback_retourne')) {
  db.exec('ALTER TABLE remboursements ADD COLUMN cashback_retourne REAL DEFAULT 0');
  console.log('Colonne cashback_retourne ajoutée à remboursements');
}
if (!remboursementColumnNames.includes('pourcentage_retourne')) {
  db.exec('ALTER TABLE remboursements ADD COLUMN pourcentage_retourne REAL DEFAULT 0');
  console.log('Colonne pourcentage_retourne ajoutée à remboursements');
}

initializeDefaultRules();

// Exporter la base de données pour l'utiliser dans index.js
module.exports = db;