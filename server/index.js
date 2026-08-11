const express = require('express');
const cors = require('cors');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());

// Vérifie si un jour du mois donné tombe dans l'intervalle [jour_debut, jour_fin],
// avec gestion du cas où l'intervalle traverse la fin du mois (ex: 28 → 5)
function jourDansIntervalle(jourActuel, jourDebut, jourFin) {
  if (jourDebut == null || jourFin == null) return true; // pas de restriction = toujours actif
  if (jourDebut <= jourFin) {
    return jourActuel >= jourDebut && jourActuel <= jourFin;
  }
  // intervalle qui traverse la fin du mois (ex: 28 à 5)
  return jourActuel >= jourDebut || jourActuel <= jourFin;
}

// Calcule le pourcentage de cashback à retourner, en réutilisant les mêmes règles
// que les remises, mais en se basant sur le nombre de jours entre le remboursement
// et l'annulation, et le jour du mois de la date d'annulation.
function calculerPourcentageCashback(jours, dateAnnulation) {
  const jourActuel = new Date(dateAnnulation).getDate();

  const candidats = db.prepare(`
    SELECT * FROM discount_rules
    WHERE jours_min <= ?
      AND (jours_max IS NULL OR jours_max >= ?)
    ORDER BY ordre ASC
  `).all(jours, jours);

  const rule = candidats.find(r => jourDansIntervalle(jourActuel, r.jour_debut, r.jour_fin));

  if (!rule) {
    return { pourcentage: 0, label: 'Aucune règle trouvée', ruleId: null };
  }
  return { pourcentage: rule.pourcentage, label: rule.label, ruleId: rule.id };
}

// Fonction utilitaire : génère les échéances en gérant le dépassement/arrondi sur la dernière
function genererEcheances(montantTotal, nombre, joursIntervalle, dateDebut) {
  const montantBase = Math.floor((montantTotal / nombre) * 100) / 100;
  const echeances = [];
  let cumule = 0;
  const dateDebutObj = new Date(dateDebut);

  for (let i = 0; i < nombre; i++) {
    const date = new Date(dateDebutObj);
    date.setDate(date.getDate() + i * joursIntervalle);

    let montant;
    if (i === nombre - 1) {
      // Dernière échéance : absorbe le reliquat (arrondi ou dépassement)
      montant = Math.round((montantTotal - cumule) * 100) / 100;
    } else {
      montant = montantBase;
      cumule = Math.round((cumule + montant) * 100) / 100;
    }

    echeances.push({
      numero: i + 1,
      date_echeance: date.toISOString().slice(0, 10),
      montant
    });
  }
  return echeances;
}

// --- Routes CRUD pour les règles de remise ---

// Récupérer toutes les règles
app.get('/api/discount-rules', (req, res) => {
  try {
    const rules = db.prepare(`
      SELECT * FROM discount_rules 
      ORDER BY ordre ASC
    `).all();
    res.json(rules);
  } catch (error) {
    console.error('Erreur GET /discount-rules:', error);
    res.status(500).json({ error: error.message });
  }
});

// Récupérer une règle par ID
app.get('/api/discount-rules/:id', (req, res) => {
  try {
    const rule = db.prepare('SELECT * FROM discount_rules WHERE id = ?').get(req.params.id);
    if (!rule) {
      return res.status(404).json({ error: 'Règle non trouvée' });
    }
    res.json(rule);
  } catch (error) {
    console.error('Erreur GET /discount-rules/:id:', error);
    res.status(500).json({ error: error.message });
  }
});

// Créer une nouvelle règle
app.post('/api/discount-rules', (req, res) => {
  try {
    const { label, jours_min, jours_max, pourcentage, ordre, jour_debut, jour_fin } = req.body;
    
    if (!label || jours_min === undefined || pourcentage === undefined) {
      return res.status(400).json({ 
        error: 'Les champs label, jours_min et pourcentage sont requis' 
      });
    }

    const jDebut = jour_debut === undefined || jour_debut === null || jour_debut === '' ? null : parseInt(jour_debut, 10);
    const jFin = jour_fin === undefined || jour_fin === null || jour_fin === '' ? null : parseInt(jour_fin, 10);

    if ((jDebut !== null && (jDebut < 1 || jDebut > 31)) || (jFin !== null && (jFin < 1 || jFin > 31))) {
      return res.status(400).json({ error: 'Jour début/fin doivent être compris entre 1 et 31' });
    }
    if ((jDebut === null) !== (jFin === null)) {
      return res.status(400).json({ error: 'Jour début et jour fin doivent être renseignés ensemble, ou tous les deux vides' });
    }
    
    // Déterminer l'ordre si non fourni
    let newOrdre = ordre;
    if (newOrdre === undefined) {
      const maxOrdre = db.prepare('SELECT MAX(ordre) as max FROM discount_rules').get();
      newOrdre = (maxOrdre.max || 0) + 1;
    }
    
    const result = db.prepare(`
      INSERT INTO discount_rules (label, jours_min, jours_max, pourcentage, ordre, jour_debut, jour_fin)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(label, jours_min, jours_max || null, pourcentage, newOrdre, jDebut, jFin);
    
    const newRule = db.prepare('SELECT * FROM discount_rules WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(newRule);
  } catch (error) {
    console.error('Erreur POST /discount-rules:', error);
    res.status(500).json({ error: error.message });
  }
});

// Modifier une règle
app.put('/api/discount-rules/:id', (req, res) => {
  try {
    const { label, jours_min, jours_max, pourcentage, ordre, jour_debut, jour_fin } = req.body;
    const id = req.params.id;
    
    const existing = db.prepare('SELECT * FROM discount_rules WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Règle non trouvée' });
    }

    const finalJourDebut = jour_debut !== undefined ? (jour_debut === '' || jour_debut === null ? null : parseInt(jour_debut, 10)) : existing.jour_debut;
    const finalJourFin = jour_fin !== undefined ? (jour_fin === '' || jour_fin === null ? null : parseInt(jour_fin, 10)) : existing.jour_fin;

    if ((finalJourDebut !== null && (finalJourDebut < 1 || finalJourDebut > 31)) || (finalJourFin !== null && (finalJourFin < 1 || finalJourFin > 31))) {
      return res.status(400).json({ error: 'Jour début/fin doivent être compris entre 1 et 31' });
    }
    if ((finalJourDebut === null) !== (finalJourFin === null)) {
      return res.status(400).json({ error: 'Jour début et jour fin doivent être renseignés ensemble, ou tous les deux vides' });
    }
    
    db.prepare(`
      UPDATE discount_rules 
      SET label = ?, jours_min = ?, jours_max = ?, pourcentage = ?, ordre = ?, jour_debut = ?, jour_fin = ?
      WHERE id = ?
    `).run(
      label || existing.label,
      jours_min !== undefined ? jours_min : existing.jours_min,
      jours_max !== undefined ? jours_max : existing.jours_max,
      pourcentage !== undefined ? pourcentage : existing.pourcentage,
      ordre !== undefined ? ordre : existing.ordre,
      finalJourDebut,
      finalJourFin,
      id
    );
    
    const updated = db.prepare('SELECT * FROM discount_rules WHERE id = ?').get(id);
    res.json(updated);
  } catch (error) {
    console.error('Erreur PUT /discount-rules/:id:', error);
    res.status(500).json({ error: error.message });
  }
});

// Supprimer une règle
app.delete('/api/discount-rules/:id', (req, res) => {
  try {
    const id = req.params.id;
    const existing = db.prepare('SELECT * FROM discount_rules WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Règle non trouvée' });
    }
    
    db.prepare('DELETE FROM discount_rules WHERE id = ?').run(id);
    res.json({ message: 'Règle supprimée avec succès' });
  } catch (error) {
    console.error('Erreur DELETE /discount-rules/:id:', error);
    res.status(500).json({ error: error.message });
  }
});

// Route pour calculer le pourcentage de remise en fonction du nombre de jours
app.get('/api/discount-rules/calculate/:jours', (req, res) => {
  try {
    const jours = parseInt(req.params.jours);
    
    if (isNaN(jours) || jours < 0) {
      return res.status(400).json({ 
        error: 'Le paramètre jours doit être un nombre positif' 
      });
    }
    
    const jourActuel = new Date().getDate(); // 1 à 31

    const candidats = db.prepare(`
      SELECT * FROM discount_rules 
      WHERE jours_min <= ? 
        AND (jours_max IS NULL OR jours_max >= ?)
      ORDER BY ordre ASC
    `).all(jours, jours);

    const rule = candidats.find(r => jourDansIntervalle(jourActuel, r.jour_debut, r.jour_fin));
    
    if (!rule) {
      return res.json({ 
        jours, 
        pourcentage: 0, 
        label: 'Aucune règle trouvée' 
      });
    }
    
    res.json({
      jours,
      pourcentage: rule.pourcentage,
      label: rule.label,
      ruleId: rule.id,
      jourActuel
    });
  } catch (error) {
    console.error('Erreur GET /discount-rules/calculate/:jours:', error);
    res.status(500).json({ error: error.message });
  }
});

// --- Routes pour le suivi des règlements (remises) ---

// Créer un règlement
app.post('/api/reglements', (req, res) => {
  try {
    const {
      invoice_id, invoice_ref, montant_original, montant_paye_reel,
      montant_remise, montant_couvert, montant_depassement,
      pourcentage_remise, date_paiement
    } = req.body;

    if (invoice_id === undefined || montant_original === undefined || montant_paye_reel === undefined) {
      return res.status(400).json({
        error: 'Les champs invoice_id, montant_original et montant_paye_reel sont requis'
      });
    }

    const result = db.prepare(`
      INSERT INTO reglements (invoice_id, invoice_ref, montant_original, montant_paye_reel, montant_remise, montant_couvert, montant_depassement, pourcentage_remise, date_paiement)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      String(invoice_id),
      invoice_ref || null,
      montant_original,
      montant_paye_reel,
      montant_remise || 0,
      montant_couvert || 0,
      montant_depassement || 0,
      pourcentage_remise || 0,
      date_paiement || null
    );

    const newReglement = db.prepare('SELECT * FROM reglements WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(newReglement);
  } catch (error) {
    console.error('Erreur POST /reglements:', error);
    res.status(500).json({ error: error.message });
  }
});

// Récupérer tous les règlements
app.get('/api/reglements', (req, res) => {
  try {
    const reglements = db.prepare('SELECT * FROM reglements ORDER BY date_creation DESC').all();
    res.json(reglements);
  } catch (error) {
    console.error('Erreur GET /reglements:', error);
    res.status(500).json({ error: error.message });
  }
});

// Récupérer les règlements d'une facture précise
app.get('/api/reglements/facture/:invoiceId', (req, res) => {
  try {
    const reglements = db.prepare('SELECT * FROM reglements WHERE invoice_id = ? ORDER BY date_creation DESC').all(req.params.invoiceId);
    res.json(reglements);
  } catch (error) {
    console.error('Erreur GET /reglements/facture/:invoiceId:', error);
    res.status(500).json({ error: error.message });
  }
});

// --- Routes échéanciers de paiement ---

// Créer un échéancier + ses échéances
app.post('/api/echeanciers', (req, res) => {
  try {
    const { invoice_id, invoice_ref, montant_total, nombre_paiements, jours_intervalle, date_debut } = req.body;

    if (!invoice_id || !montant_total || !nombre_paiements || !jours_intervalle || !date_debut) {
      return res.status(400).json({
        error: 'invoice_id, montant_total, nombre_paiements, jours_intervalle et date_debut sont requis'
      });
    }
    if (montant_total <= 0 || nombre_paiements <= 0 || jours_intervalle <= 0) {
      return res.status(400).json({ error: 'Les montants et quantités doivent être positifs' });
    }

    const echeancierResult = db.prepare(`
      INSERT INTO echeanciers (invoice_id, invoice_ref, montant_total, nombre_paiements, jours_intervalle, date_debut)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(String(invoice_id), invoice_ref || null, montant_total, nombre_paiements, jours_intervalle, date_debut);

    const echeancierId = echeancierResult.lastInsertRowid;
    const lignes = genererEcheances(montant_total, nombre_paiements, jours_intervalle, date_debut);

    const insertEcheance = db.prepare(`
      INSERT INTO echeances (echeancier_id, numero, date_echeance, montant)
      VALUES (?, ?, ?, ?)
    `);

    // On capture l'id réel de chaque échéance insérée
    for (const ligne of lignes) {
      const result = insertEcheance.run(echeancierId, ligne.numero, ligne.date_echeance, ligne.montant);
      ligne.id = result.lastInsertRowid;
      ligne.echeancier_id = echeancierId;
      ligne.statut = 'en_attente';
      ligne.date_paiement = null;
    }

    const echeancier = db.prepare('SELECT * FROM echeanciers WHERE id = ?').get(echeancierId);

    res.status(201).json({ ...echeancier, echeances: lignes });
  } catch (error) {
    console.error('Erreur POST /echeanciers:', error);
    res.status(500).json({ error: error.message });
  }
});

// Récupérer les échéanciers d'une facture (avec leurs échéances)
app.get('/api/echeanciers/facture/:invoiceId', (req, res) => {
  try {
    const echeanciers = db.prepare(
      'SELECT * FROM echeanciers WHERE invoice_id = ? ORDER BY date_creation DESC'
    ).all(req.params.invoiceId);

    const result = echeanciers.map(ech => ({
      ...ech,
      echeances: db.prepare('SELECT * FROM echeances WHERE echeancier_id = ? ORDER BY numero ASC').all(ech.id)
    }));

    res.json(result);
  } catch (error) {
    console.error('Erreur GET /echeanciers/facture/:invoiceId:', error);
    res.status(500).json({ error: error.message });
  }
});

// Récupérer tous les échéanciers (backoffice / debug)
app.get('/api/echeanciers', (req, res) => {
  try {
    const echeanciers = db.prepare('SELECT * FROM echeanciers ORDER BY date_creation DESC').all();
    res.json(echeanciers);
  } catch (error) {
    console.error('Erreur GET /echeanciers:', error);
    res.status(500).json({ error: error.message });
  }
});

// Marquer une échéance comme payée
app.put('/api/echeances/:id/payer', (req, res) => {
  try {
    const { date_paiement } = req.body;
    const id = req.params.id;

    const existing = db.prepare('SELECT * FROM echeances WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Échéance non trouvée' });
    }
    if (existing.statut === 'payé') {
      return res.status(400).json({ error: 'Cette échéance est déjà payée' });
    }

    db.prepare(`
      UPDATE echeances SET statut = 'payé', date_paiement = ? WHERE id = ?
    `).run(date_paiement || new Date().toISOString().slice(0, 10), id);

    const updated = db.prepare('SELECT * FROM echeances WHERE id = ?').get(id);
    res.json(updated);
  } catch (error) {
    console.error('Erreur PUT /echeances/:id/payer:', error);
    res.status(500).json({ error: error.message });
  }
});

// --- Routes remboursements ---

// Créer un remboursement (rembourse le montant payé réel ; le cashback est conservé et reclassé en "payé")
app.post('/api/remboursements', (req, res) => {
  try {
    const { invoice_id, invoice_ref, montant_rembourse, montant_cashback, date_remboursement } = req.body;

    if (invoice_id === undefined || montant_rembourse === undefined) {
      return res.status(400).json({ error: 'invoice_id et montant_rembourse sont requis' });
    }
    if (!date_remboursement) {
      return res.status(400).json({ error: 'La date de remboursement est requise' });
    }

    const existing = db.prepare(
      `SELECT * FROM remboursements WHERE invoice_id = ? AND statut = 'actif'`
    ).get(String(invoice_id));
    if (existing) {
      return res.status(400).json({ error: 'Cette facture a déjà un remboursement actif' });
    }

    const result = db.prepare(`
      INSERT INTO remboursements (invoice_id, invoice_ref, montant_rembourse, montant_cashback, date_remboursement)
      VALUES (?, ?, ?, ?, ?)
    `).run(String(invoice_id), invoice_ref || null, montant_rembourse, montant_cashback || 0, date_remboursement);

    const newRemboursement = db.prepare('SELECT * FROM remboursements WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(newRemboursement);
  } catch (error) {
    console.error('Erreur POST /remboursements:', error);
    res.status(500).json({ error: error.message });
  }
});

// Récupérer les remboursements (optionnellement filtrés par statut : actif | annule)
app.get('/api/remboursements', (req, res) => {
  try {
    const { statut } = req.query;
    const remboursements = statut
      ? db.prepare('SELECT * FROM remboursements WHERE statut = ? ORDER BY date_remboursement DESC').all(statut)
      : db.prepare('SELECT * FROM remboursements ORDER BY date_remboursement DESC').all();
    res.json(remboursements);
  } catch (error) {
    console.error('Erreur GET /remboursements:', error);
    res.status(500).json({ error: error.message });
  }
});

// Annuler un remboursement (retour à l'état d'avant le clic sur "Rembourser")
app.put('/api/remboursements/:id/annuler', (req, res) => {
  try {
    const id = req.params.id;
    const { date_annulation } = req.body;

    const existing = db.prepare('SELECT * FROM remboursements WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Remboursement non trouvé' });
    }
    if (existing.statut === 'annule') {
      return res.status(400).json({ error: 'Ce remboursement est déjà annulé' });
    }
    if (!date_annulation) {
      return res.status(400).json({ error: "La date d'annulation est requise" });
    }

    const dateRemboursement = new Date(existing.date_remboursement);
    const dateAnnul = new Date(date_annulation);

    if (isNaN(dateAnnul.getTime())) {
      return res.status(400).json({ error: "Date d'annulation invalide" });
    }
    if (dateAnnul < dateRemboursement) {
      return res.status(400).json({ error: "La date d'annulation ne peut pas être antérieure à la date de remboursement" });
    }

    // Nombre de jours entre le remboursement et l'annulation
    const jours = Math.floor((dateAnnul - dateRemboursement) / (1000 * 60 * 60 * 24));

    // Calcul automatique du pourcentage rendu, selon les mêmes règles que "Configuration des remises"
    const { pourcentage, label } = calculerPourcentageCashback(jours, date_annulation);
    const cashbackRetourne = Math.round((existing.montant_cashback * pourcentage / 100) * 100) / 100;

    db.prepare(`
      UPDATE remboursements
      SET statut = 'annule',
          date_annulation = ?,
          cashback_retourne = ?,
          pourcentage_retourne = ?
      WHERE id = ?
    `).run(date_annulation, cashbackRetourne, pourcentage, id);

    const updated = db.prepare('SELECT * FROM remboursements WHERE id = ?').get(id);
    res.json({ ...updated, jours_ecoules: jours, regle_appliquee: label });
  } catch (error) {
    console.error('Erreur PUT /remboursements/:id/annuler:', error);
    res.status(500).json({ error: error.message });
  }
});

// --- Routes historique des prix produits (multi-prix côté boutique) ---
// Note : l'API REST Dolibarr ne permet pas d'écrire les multiprix par niveau
// (uniquement en lecture), donc on historise nous-mêmes chaque prix unitaire rencontré.

app.post('/api/product-prices', (req, res) => {
  try {
    const { ref_produit, pu_ht, taxe, num_facture } = req.body;
    if (!ref_produit || pu_ht === undefined) {
      return res.status(400).json({ error: 'ref_produit et pu_ht sont requis' });
    }
    db.prepare(`
      INSERT OR IGNORE INTO product_prices (ref_produit, pu_ht, taxe, num_facture)
      VALUES (?, ?, ?, ?)
    `).run(ref_produit, pu_ht, taxe || 0, num_facture || null);
    res.status(201).json({ message: 'Prix enregistré' });
  } catch (error) {
    console.error('Erreur POST /product-prices:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/product-prices/:ref', (req, res) => {
  try {
    const prices = db.prepare(`
      SELECT pu_ht, taxe FROM product_prices WHERE ref_produit = ? ORDER BY pu_ht ASC
    `).all(req.params.ref);
    res.json(prices);
  } catch (error) {
    console.error('Erreur GET /product-prices/:ref:', error);
    res.status(500).json({ error: error.message });
  }
});

// Démarrer le serveur
app.listen(PORT, () => {
  console.log(`  Serveur de configuration des remises démarré sur http://localhost:${PORT}`);
  console.log(`  Routes disponibles :`);
  console.log(`  GET  /api/discount-rules`);
  console.log(`  GET  /api/discount-rules/:id`);
  console.log(`  POST /api/discount-rules`);
  console.log(`  PUT  /api/discount-rules/:id`);
  console.log(`  DELETE /api/discount-rules/:id`);
  console.log(`  GET  /api/discount-rules/calculate/:jours`);
  console.log(`  POST /api/reglements`);
  console.log(`  GET  /api/reglements`);
  console.log(`  GET  /api/reglements/facture/:invoiceId`);
  console.log(`  POST /api/echeanciers`);
  console.log(`  GET  /api/echeanciers/facture/:invoiceId`);
  console.log(`  GET  /api/echeanciers`);
  console.log(`  PUT  /api/echeances/:id/payer`);
  console.log(`  POST /api/remboursements`);
  console.log(`  GET  /api/remboursements`);
  console.log(`  PUT  /api/remboursements/:id/annuler`);
});