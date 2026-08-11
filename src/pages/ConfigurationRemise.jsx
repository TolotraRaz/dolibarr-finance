import React, { useState, useEffect } from 'react';
import {
  getDiscountRules,
  createDiscountRule,
  updateDiscountRule,
  deleteDiscountRule
} from '../services/discountService';

const emptyForm = { label: '', jours_min: '', jours_max: '', pourcentage: '', jour_debut: '', jour_fin: '' };

const ConfigurationRemise = () => {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    loadRules();
  }, []);

  const loadRules = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await getDiscountRules();
      setRules(data);
    } catch (err) {
      setError("Impossible de charger les règles. Le serveur backend est-il démarré (npm start dans /server) ?");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.label || form.jours_min === '' || form.pourcentage === '') {
      alert('Label, jours minimum et pourcentage sont obligatoires');
      return;
    }

    if ((form.jour_debut === '') !== (form.jour_fin === '')) {
      alert('Jour début et jour fin doivent être renseignés ensemble, ou tous les deux vides');
      return;
    }
    if (form.jour_debut !== '' && (form.jour_debut < 1 || form.jour_debut > 31)) {
      alert('Jour début doit être entre 1 et 31');
      return;
    }
    if (form.jour_fin !== '' && (form.jour_fin < 1 || form.jour_fin > 31)) {
      alert('Jour fin doit être entre 1 et 31');
      return;
    }

    const payload = {
      label: form.label,
      jours_min: parseInt(form.jours_min, 10),
      jours_max: form.jours_max === '' ? null : parseInt(form.jours_max, 10),
      pourcentage: parseFloat(form.pourcentage),
      jour_debut: form.jour_debut === '' ? null : parseInt(form.jour_debut, 10),
      jour_fin: form.jour_fin === '' ? null : parseInt(form.jour_fin, 10)
    };

    try {
      if (editingId) {
        await updateDiscountRule(editingId, payload);
      } else {
        await createDiscountRule(payload);
      }
      resetForm();
      loadRules();
    } catch (err) {
      alert("Erreur lors de l'enregistrement : " + (err.response?.data?.error || err.message));
    }
  };

  const handleEdit = (rule) => {
    setEditingId(rule.id);
    setForm({
      label: rule.label,
      jours_min: rule.jours_min,
      jours_max: rule.jours_max === null ? '' : rule.jours_max,
      pourcentage: rule.pourcentage,
      jour_debut: rule.jour_debut === null ? '' : rule.jour_debut,
      jour_fin: rule.jour_fin === null ? '' : rule.jour_fin
    });
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer cette règle de remise ?')) return;
    try {
      await deleteDiscountRule(id);
      loadRules();
    } catch (err) {
      alert('Erreur lors de la suppression : ' + (err.response?.data?.error || err.message));
    }
  };

  if (loading) {
    return (
      <div className="container">
        <div className="card" style={{ textAlign: 'center', padding: '60px 20px' }}>
          <h3 style={{ color: '#0066cc' }}>Chargement des règles...</h3>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="card">
        <h2>Configuration des remises selon délai de règlement</h2>
        <p style={{ color: '#666', marginBottom: '20px' }}>
          Définissez le pourcentage de remise appliqué selon le nombre de jours entre l'échéance
          de la facture et la date de règlement. Vous pouvez ajouter, modifier ou supprimer autant
          de paliers que nécessaire.
        </p>

        {error && (
          <div style={{
            background: '#fdecea', border: '1px solid #dc3545',
            borderRadius: '4px', padding: '15px', marginBottom: '20px', color: '#dc3545'
          }}>
             {error}
          </div>
        )}

        {/* Formulaire d'ajout / modification */}
        <form onSubmit={handleSubmit} style={{ marginBottom: '30px' }}>
          <div className="grid-2">
            <div className="form-group">
              <label>Libellé</label>
              <input
                type="text"
                value={form.label}
                onChange={(e) => handleChange('label', e.target.value)}
                placeholder="Ex: Moins d'une semaine"
              />
            </div>
            <div className="form-group">
              <label>Pourcentage de remise (%)</label>
              <input
                type="number"
                step="0.01"
                value={form.pourcentage}
                onChange={(e) => handleChange('pourcentage', e.target.value)}
                placeholder="Ex: 15"
              />
            </div>
            <div className="form-group">
              <label>Jours minimum (inclus)</label>
              <input
                type="number"
                value={form.jours_min}
                onChange={(e) => handleChange('jours_min', e.target.value)}
                placeholder="Ex: 0"
              />
            </div>
            <div className="form-group">
              <label>Jours maximum (inclus, vide = illimité)</label>
              <input
                type="number"
                value={form.jours_max}
                onChange={(e) => handleChange('jours_max', e.target.value)}
                placeholder="Ex: 7 (laisser vide pour 'plus de X jours')"
              />
            </div>
          </div>
          <p style={{ color: '#888', fontSize: '13px', marginTop: '8px' }}>
            Restreint la règle à une plage de jours du mois, répétée chaque mois (ex: 1 à 15 = première quinzaine).
            Si jour début &gt; jour fin (ex: 28 à 5), l'intervalle traverse la fin du mois. Laissez vide pour une règle active tous les jours.
          </p>

          <div style={{ marginTop: '15px' }}>
            <button type="submit" className="btn btn-primary">
              {editingId ? 'Mettre à jour' : 'Ajouter la règle'}
            </button>
            {editingId && (
              <button
                type="button"
                className="btn btn-secondary"
                style={{ marginLeft: '10px' }}
                onClick={resetForm}
              >
                Annuler
              </button>
            )}
          </div>
        </form>

        {/* Tableau des règles existantes */}
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Libellé</th>
                <th>Jours min</th>
                <th>Jours max</th>
                <th>Jours du mois</th>
                <th>Remise</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.map(rule => (
                <tr key={rule.id}>
                  <td>{rule.label}</td>
                  <td>{rule.jours_min}</td>
                  <td>{rule.jours_max === null ? '∞ (illimité)' : rule.jours_max}</td>
                  <td>
                    {rule.jour_debut !== null && rule.jour_fin !== null
                      ? `${rule.jour_debut} → ${rule.jour_fin}`
                      : <span style={{ color: '#999' }}>Tous les jours</span>}
                  </td>
                  <td><strong>{rule.pourcentage}%</strong></td>
                  <td>
                    <button
                      className="btn btn-secondary"
                      style={{ marginRight: '8px', padding: '4px 10px', fontSize: '13px' }}
                      onClick={() => handleEdit(rule)}
                    >
                      Modifier
                    </button>
                    <button
                      className="btn btn-danger"
                      style={{ padding: '4px 10px', fontSize: '13px' }}
                      onClick={() => handleDelete(rule.id)}
                    >
                      Supprimer
                    </button>
                  </td>
                </tr>
              ))}
              {rules.length === 0 && (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', color: '#666' }}>
                    Aucune règle définie
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ConfigurationRemise;