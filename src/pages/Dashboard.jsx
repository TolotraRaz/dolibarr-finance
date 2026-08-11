import React, { useState, useEffect, useRef } from 'react';
import { getInvoices, getCustomers, getInvoicePayments, getInvoiceLines } from '../services/api';
import { getReglements, getRemboursements, createRemboursement } from '../services/discountService';
import { getCalculatedDiscounts, clearCalculatedDiscounts } from '../services/importService';

const Dashboard = () => {
  const [invoices, setInvoices] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [monthlyStats, setMonthlyStats] = useState([]);
  const [apiError, setApiError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [expandedMonth, setExpandedMonth] = useState(null);
  const [invoicesByMonth, setInvoicesByMonth] = useState({});
  const [productSales, setProductSales] = useState([]);
  const [expandedProduct, setExpandedProduct] = useState(null);
  const [linesByProduct, setLinesByProduct] = useState({});
  const [reglementsByInvoice, setReglementsByInvoice] = useState({});
  const [reglementsBruts, setReglementsBruts] = useState([]);
  const [expandedReglementInvoice, setExpandedReglementInvoice] = useState(null);
  const paymentsByInvoiceRef = useRef({});

  //  État pour les remises calculées
  const [calculatedDiscounts, setCalculatedDiscounts] = useState([]);
  const [showCalculated, setShowCalculated] = useState(false);
  const [expandedDiscount, setExpandedDiscount] = useState(null);

  //  État pour les remboursements
  const [remboursementsByInvoice, setRemboursementsByInvoice] = useState({});
  const [remboursementsAnnulesByInvoice, setRemboursementsAnnulesByInvoice] = useState({});
  const [dateRemboursementByInvoice, setDateRemboursementByInvoice] = useState({});

  useEffect(() => {
    loadData();
    
    //  Récupérer les remises calculées lors de l'importation
    const discounts = getCalculatedDiscounts();
    if (discounts && discounts.length > 0) {
      setCalculatedDiscounts(discounts);
      setShowCalculated(true);
    }
  }, []);

  //  Fonction pour réinitialiser les remises affichées
  const clearDiscountDisplay = () => {
    clearCalculatedDiscounts();
    setCalculatedDiscounts([]);
    setShowCalculated(false);
  };

  //  NOUVEAU : Fonction pour charger les remboursements
  const loadRemboursements = async () => {
    try {
      const [actifs, annules] = await Promise.all([
        getRemboursements('actif'),
        getRemboursements('annule')
      ]);

      const mapActif = {};
      (Array.isArray(actifs) ? actifs : []).forEach(rb => { mapActif[rb.invoice_id] = rb; });
      setRemboursementsByInvoice(mapActif);

      // Garde le remboursement annulé le plus récent par facture
      const mapAnnule = {};
      (Array.isArray(annules) ? annules : []).forEach(rb => {
        const courant = mapAnnule[rb.invoice_id];
        if (!courant || new Date(rb.date_annulation) > new Date(courant.date_annulation)) {
          mapAnnule[rb.invoice_id] = rb;
        }
      });
      setRemboursementsAnnulesByInvoice(mapAnnule);
    } catch (error) {
      console.error('Impossible de charger les remboursements:', error);
      setRemboursementsByInvoice({});
      setRemboursementsAnnulesByInvoice({});
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      setApiError(false);
      setErrorMessage('');

      const [invoicesData, customersData] = await Promise.all([
        getInvoices(),
        getCustomers()
      ]);

      const safeInvoices = Array.isArray(invoicesData) ? invoicesData : [];
      const safeCustomers = Array.isArray(customersData) ? customersData : [];

      setInvoices(safeInvoices);
      setCustomers(safeCustomers);

      // Récupérer les vrais paiements pour chaque facture
      const paymentsByInvoice = {};
      await Promise.all(
        safeInvoices.map(async (invoice) => {
          try {
            const payments = await getInvoicePayments(invoice.id);
            const totalPaid = Array.isArray(payments)
              ? payments.reduce((sum, p) => sum + parseFloat(p.amount || p.montant || 0), 0)
              : 0;
            paymentsByInvoice[invoice.id] = totalPaid;
          } catch {
            paymentsByInvoice[invoice.id] = 0;
          }
        })
      );

      paymentsByInvoiceRef.current = paymentsByInvoice;

      // Récupérer les lignes de chaque facture pour calculer les ventes par produit
      const linesData = {};
      await Promise.all(
        safeInvoices.map(async (invoice) => {
          try {
            const lines = await getInvoiceLines(invoice.id);
            linesData[invoice.id] = Array.isArray(lines) ? lines : [];
          } catch {
            linesData[invoice.id] = [];
          }
        })
      );

      calculateMonthlyStats(safeInvoices, paymentsByInvoice);
      calculateProductSales(safeInvoices, linesData);

      // Récupération du suivi des règlements (remises) — backend séparé (SQLite)
      try {
        const reglements = await getReglements();
        const liste = Array.isArray(reglements) ? reglements : [];
        setReglementsBruts(liste);

        const grouped = {};
        liste.forEach(r => {
          if (!grouped[r.invoice_id]) {
            grouped[r.invoice_id] = { 
              montant_original: 0, 
              montant_paye_reel: 0, 
              montant_remise: 0, 
              montant_depassement: 0, 
              montant_couvert: 0 
            };
          }
          grouped[r.invoice_id].montant_original = parseFloat(r.montant_original || 0);
          grouped[r.invoice_id].montant_paye_reel += parseFloat(r.montant_paye_reel || 0);
          grouped[r.invoice_id].montant_remise += parseFloat(r.montant_remise || 0);
          grouped[r.invoice_id].montant_depassement += parseFloat(r.montant_depassement || 0);
          grouped[r.invoice_id].montant_couvert += parseFloat(r.montant_couvert || 0);
        });
        setReglementsByInvoice(grouped);
      } catch (reglementError) {
        console.error('Impossible de charger le suivi des règlements:', reglementError);
        setReglementsByInvoice({});
        setReglementsBruts([]);
      }

      //  charger les remboursements actifs
      await loadRemboursements();

    } catch (error) {
      console.error('Erreur chargement données:', error);

      if (error.response?.status === 404) {
        setApiError(false);
        setInvoices([]);
        setCustomers([]);
        setMonthlyStats([]);
        setErrorMessage('Aucune donnée trouvée dans Dolibarr. Commencez par importer des données.');
      } else if (error.response?.status === 401 || error.response?.status === 403) {
        setApiError(true);
        setErrorMessage('Clé API invalide ou non autorisée. Vérifiez votre clé API.');
      } else if (error.code === 'ERR_NETWORK') {
        setApiError(true);
        setErrorMessage('Impossible de se connecter à Dolibarr. Vérifiez que le serveur est en cours d\'exécution.');
      } else {
        setApiError(true);
        setErrorMessage(`Erreur: ${error.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  // Génère une clé mois/année cohérente
  const getMonthKey = (rawDate) => {
    if (!rawDate) return null;
    const date = typeof rawDate === 'number' || /^\d+$/.test(rawDate)
      ? new Date(rawDate * 1000)
      : new Date(rawDate);
    if (isNaN(date.getTime())) return null;
    return `${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
  };

  const calculateMonthlyStats = (invoicesData, paymentsByInvoice) => {
    const monthlyData = {};
    const monthlyInvoices = {};

    invoicesData.forEach(invoice => {
      const monthYear = getMonthKey(invoice.date);
      if (!monthYear) return;

      if (!monthlyData[monthYear]) {
        monthlyData[monthYear] = {
          total: 0,
          paye: 0,
          restant: 0,
          count: 0
        };
        monthlyInvoices[monthYear] = [];
      }

      const total = parseFloat(invoice.total_ttc || invoice.total_ht || 0);
      const paye = paymentsByInvoice[invoice.id] || 0;

      monthlyData[monthYear].total += total;
      monthlyData[monthYear].count += 1;
      monthlyData[monthYear].paye += paye;
      monthlyData[monthYear].restant += (total - paye);

      monthlyInvoices[monthYear].push({
        id: invoice.id,
        ref: invoice.ref,
        date: invoice.date,
        socid: invoice.socid,
        total,
        paye,
        restant: total - paye
      });
    });

    const sortedMonths = Object.keys(monthlyData).sort((a, b) => {
      const [aMonth, aYear] = a.split('/');
      const [bMonth, bYear] = b.split('/');
      if (aYear !== bYear) return aYear - bYear;
      return aMonth - bMonth;
    });

    const statsArray = sortedMonths.map(month => ({
      month,
      ...monthlyData[month]
    }));

    setMonthlyStats(statsArray);
    setInvoicesByMonth(monthlyInvoices);
  };

  const calculateProductSales = (invoicesData, linesData) => {
    const productsMap = {};
    const productLinesMap = {};

    invoicesData.forEach(invoice => {
      const lines = linesData[invoice.id] || [];
      lines.forEach(line => {
        const key = line.ref || line.product_ref || line.desc || 'Produit inconnu';
        const label = line.desc || line.product_label || key;
        const qty = parseFloat(line.qty || 0);
        const subprice = parseFloat(line.subprice || 0);
        const remise = parseFloat(line.remise_percent || 0);
        const tva = parseFloat(line.tva_tx || 0);

        const totalHT = qty * subprice * (1 - remise / 100);
        const totalTTC = totalHT * (1 + tva / 100);

        if (!productsMap[key]) {
          productsMap[key] = { ref: key, label, quantite: 0, totalHT: 0, totalTTC: 0 };
          productLinesMap[key] = [];
        }

        productsMap[key].quantite += qty;
        productsMap[key].totalHT += totalHT;
        productsMap[key].totalTTC += totalTTC;

        productLinesMap[key].push({
          invoiceRef: invoice.ref,
          invoiceId: invoice.id,
          qty,
          subprice,
          remise,
          tva,
          totalHT,
          totalTTC
        });
      });
    });

    const sorted = Object.values(productsMap).sort((a, b) => b.totalTTC - a.totalTTC);

    setProductSales(sorted);
    setLinesByProduct(productLinesMap);
  };

  const toggleMonth = (month) => {
    setExpandedMonth(prev => (prev === month ? null : month));
  };

  const toggleProduct = (ref) => {
    setExpandedProduct(prev => (prev === ref ? null : ref));
  };

  const toggleReglementInvoice = (invoiceId) => {
    setExpandedReglementInvoice(prev => (prev === invoiceId ? null : invoiceId));
  };

  //  Fonction pour toggle l'expansion des remises
  const toggleDiscount = (index) => {
    setExpandedDiscount(prev => (prev === index ? null : index));
  };

  //  Fonction pour gérer le clic "Rembourser"
  const handleRembourser = async (e, invoiceId, invoiceRef, r) => {
    e.stopPropagation();

    const dateRemboursement = dateRemboursementByInvoice[invoiceId];
    if (!dateRemboursement) {
      alert('Veuillez sélectionner une date de remboursement avant de valider.');
      return;
    }

    if (!window.confirm(
      `Confirmer le remboursement de ${r.montant_paye_reel.toFixed(2)} € pour la facture ${invoiceRef} ` +
      `à la date du ${new Date(dateRemboursement).toLocaleDateString('fr-FR')} ?`
    )) {
      return;
    }

    try {
      await createRemboursement({
        invoice_id: invoiceId,
        invoice_ref: invoiceRef,
        montant_rembourse: r.montant_paye_reel,
        montant_cashback: r.montant_remise,
        date_remboursement: dateRemboursement
      });
      await loadRemboursements();
    } catch (error) {
      alert(`Erreur lors du remboursement : ${error.response?.data?.error || error.message}`);
    }
  };

  // Reconstitue, pour une facture, la liste triée par date avec le restant dû après chaque versement
  const getDetailReglements = (invoiceId, montantOriginal) => {
    const lignes = reglementsBruts
      .filter(r => String(r.invoice_id) === String(invoiceId))
      .sort((a, b) => new Date(a.date_paiement || a.date_creation) - new Date(b.date_paiement || b.date_creation));

    let cumulCouvert = 0;
    return lignes.map(r => {
      cumulCouvert += parseFloat(r.montant_couvert || 0);
      return {
        ...r,
        restantApres: Math.max(0, Math.round((montantOriginal - cumulCouvert) * 100) / 100)
      };
    });
  };

  // Calculer les totaux généraux avec les bons champs
  const totalInvoices = invoices.length;
  const totalCustomers = customers.length;
  const totalAmount = invoices.reduce((sum, inv) => sum + parseFloat(inv.total_ttc || inv.total_ht || 0), 0);
  const averageAmount = totalInvoices > 0 ? totalAmount / totalInvoices : 0;

  const totalPaid = monthlyStats.reduce((sum, stat) => sum + stat.paye, 0);

  //  Totaux cashback / dépassement basés sur le suivi des règlements
  const totalCashback = Object.values(reglementsByInvoice)
    .reduce((sum, r) => sum + (r.montant_remise || 0), 0);

  const totalDepassement = Object.values(reglementsByInvoice)
    .reduce((sum, r) => sum + (r.montant_depassement || 0), 0);

  const totalEncaisseMoinsCashback = totalPaid - totalCashback;

  const totalRestantGlobal = totalAmount - totalEncaisseMoinsCashback;

  if (loading) {
    return (
      <div className="container">
        <div className="card" style={{ textAlign: 'center', padding: '60px 20px' }}>
          <h3 style={{ color: '#0066cc' }}>Chargement des données...</h3>
        </div>
      </div>
    );
  }

  // Affichage du message d'erreur si l'API n'est pas connectée
  if (apiError) {
    return (
      <div className="container">
        <div className="card" style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: '48px', marginBottom: '20px' }}>🔌</div>
          <h3 style={{ color: '#dc3545', marginBottom: '15px' }}>
            Erreur de connexion à l'API
          </h3>
          <p style={{ color: '#666', marginBottom: '20px' }}>
            {errorMessage}
          </p>
          <div style={{ marginTop: '20px' }}>
            <button 
              className="btn btn-primary" 
              onClick={loadData}
            >
              🔄 Réessayer
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="card">
        <h2>Dashboard - Analyse des factures</h2>

        {/*  Remises calculées lors de l'importation */}
        {showCalculated && calculatedDiscounts.length > 0 && (
          <div style={{ 
            marginBottom: '30px',
            padding: '20px',
            background: 'linear-gradient(135deg, #e8f4fd 0%, #d4edda 100%)',
            border: '2px solid #0066cc',
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
              <h3 style={{ color: '#0066cc', margin: 0 }}>
                 Remises calculées lors de l'importation
              </h3>
              <div>
                <button 
                  className="btn btn-secondary" 
                  onClick={clearDiscountDisplay}
                  style={{ fontSize: '12px', padding: '5px 10px', marginRight: '10px' }}
                >
                   Masquer
                </button>
                <button 
                  className="btn btn-primary"
                  onClick={() => window.location.href = '/configuration-remise'}
                  style={{ fontSize: '12px', padding: '5px 10px' }}
                >
                   Configurer les règles
                </button>
              </div>
            </div>
            
            {/* Statistiques des remises */}
            <div className="stats-grid" style={{ marginTop: '15px' }}>
              <div className="stat-card">
                <div className="label">Nombre de remises</div>
                <div className="value">{calculatedDiscounts.length}</div>
              </div>
              <div className="stat-card success">
                <div className="label">Total économisé</div>
                <div className="value">
                  {calculatedDiscounts.reduce((sum, d) => sum + d.discountAmount, 0).toFixed(2)} €
                </div>
              </div>
              <div className="stat-card" style={{ borderColor: '#ffc107' }}>
                <div className="label">Remise moyenne</div>
                <div className="value">
                  {(calculatedDiscounts.reduce((sum, d) => sum + d.pourcentage, 0) / calculatedDiscounts.length).toFixed(1)}%
                </div>
              </div>
              <div className="stat-card" style={{ borderColor: '#17a2b8' }}>
                <div className="label">Montant après remise</div>
                <div className="value" style={{ color: '#17a2b8' }}>
                  {calculatedDiscounts.reduce((sum, d) => sum + d.amountAfterDiscount, 0).toFixed(2)} €
                </div>
              </div>
            </div>

            {/* Tableau détaillé des remises */}
            <div className="table-container" style={{ marginTop: '15px' }}>
              <table>
                <thead>
                  <tr>
                    <th>Facture</th>
                    <th>Jours</th>
                    <th>Règle appliquée</th>
                    <th>Montant original</th>
                    <th>Remise %</th>
                    <th>Montant remisé</th>
                    <th>Après remise</th>
                  </tr>
                </thead>
                <tbody>
                  {calculatedDiscounts.map((discount, index) => (
                    <React.Fragment key={index}>
                      <tr 
                        onClick={() => toggleDiscount(index)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td>
                          <strong>
                            {expandedDiscount === index ? '▼' : '▶'} {discount.invoiceRef}
                          </strong>
                        </td>
                        <td>
                          <span style={{ 
                            background: discount.daysDiff <= 0 ? '#d4edda' : 
                                       discount.daysDiff <= 7 ? '#fff3cd' : 
                                       discount.daysDiff <= 30 ? '#cce5ff' : '#f8d7da',
                            padding: '2px 8px',
                            borderRadius: '12px',
                            fontSize: '12px'
                          }}>
                            {discount.daysDiff} {discount.daysDiff <= 0 ? '(anticipé)' : 'jours'}
                          </span>
                        </td>
                        <td>{discount.label}</td>
                        <td>{discount.originalAmount.toFixed(2)} €</td>
                        <td style={{ 
                          color: discount.pourcentage > 0 ? '#28a745' : '#999',
                          fontWeight: 'bold'
                        }}>
                          {discount.pourcentage}%
                        </td>
                        <td style={{ color: '#ffc107', fontWeight: 'bold' }}>
                          -{discount.discountAmount.toFixed(2)} €
                        </td>
                        <td style={{ color: '#28a745', fontWeight: 'bold' }}>
                          {discount.amountAfterDiscount.toFixed(2)} €
                        </td>
                      </tr>

                      {/* Détail étendu */}
                      {expandedDiscount === index && (
                        <tr>
                          <td colSpan="7" style={{ background: '#f8f9fa', padding: '15px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                              <div>
                                <h4 style={{ margin: '0 0 10px 0', color: '#0066cc' }}>📋 Détails du calcul</h4>
                                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                                  <li style={{ padding: '5px 0', borderBottom: '1px solid #eee' }}>
                                    <strong>Date facture :</strong> {discount.invoiceDate || 'N/A'}
                                  </li>
                                  <li style={{ padding: '5px 0', borderBottom: '1px solid #eee' }}>
                                    <strong>Date paiement :</strong> {discount.paymentDate || 'N/A'}
                                  </li>
                                  <li style={{ padding: '5px 0', borderBottom: '1px solid #eee' }}>
                                    <strong>Écart :</strong> {discount.daysDiff} jours
                                  </li>
                                  <li style={{ padding: '5px 0' }}>
                                    <strong>Règle ID :</strong> {discount.ruleId || 'N/A'}
                                  </li>
                                </ul>
                              </div>
                              <div>
                                <h4 style={{ margin: '0 0 10px 0', color: '#28a745' }}> Impact financier</h4>
                                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                                  <li style={{ padding: '5px 0', borderBottom: '1px solid #eee' }}>
                                    <strong>Montant original :</strong> {discount.originalAmount.toFixed(2)} €
                                  </li>
                                  <li style={{ padding: '5px 0', borderBottom: '1px solid #eee', color: '#ffc107' }}>
                                    <strong>Remise :</strong> -{discount.discountAmount.toFixed(2)} €
                                  </li>
                                  <li style={{ padding: '5px 0', borderBottom: '1px solid #eee', color: '#28a745' }}>
                                    <strong>Montant après remise :</strong> {discount.amountAfterDiscount.toFixed(2)} €
                                  </li>
                                  <li style={{ padding: '5px 0', color: '#0066cc' }}>
                                    <strong>Économie réalisée :</strong> {((discount.discountAmount / discount.originalAmount) * 100).toFixed(1)}%
                                  </li>
                                </ul>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
                <tfoot style={{ background: '#f8f9fa', fontWeight: 'bold' }}>
                  <tr>
                    <td colSpan="3"><strong>TOTAL</strong></td>
                    <td>
                      {calculatedDiscounts.reduce((sum, d) => sum + d.originalAmount, 0).toFixed(2)} €
                    </td>
                    <td>—</td>
                    <td style={{ color: '#ffc107' }}>
                      {calculatedDiscounts.reduce((sum, d) => sum + d.discountAmount, 0).toFixed(2)} €
                    </td>
                    <td style={{ color: '#28a745' }}>
                      {calculatedDiscounts.reduce((sum, d) => sum + d.amountAfterDiscount, 0).toFixed(2)} €
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Indicateur d'action */}
            <div style={{ 
              marginTop: '15px', 
              padding: '10px', 
              background: '#fff',
              borderRadius: '4px',
              textAlign: 'center'
            }}>
              <p style={{ margin: 0, color: '#666', fontSize: '13px' }}>
                 Ces remises ont été calculées automatiquement lors de l'importation.
                Elles ne sont pas enregistrées en base. Pour les sauvegarder, 
                utilisez la page <strong>"Gestion des remises"</strong>.
              </p>
            </div>
          </div>
        )}

        {/* Message si aucune donnée */}
        {totalInvoices === 0 && totalCustomers === 0 && (
          <div style={{ 
            background: '#e8f4fd', 
            border: '1px solid #0066cc',
            borderRadius: '4px',
            padding: '20px',
            marginBottom: '20px',
            textAlign: 'center'
          }}>
            <p style={{ color: '#0066cc', margin: 0, fontSize: '16px' }}>
              {errorMessage || 'Aucune donnée trouvée dans Dolibarr.'}
              <br /><br />
              <button 
                className="btn btn-primary" 
                onClick={() => window.location.href = '/importation'}
                style={{ marginTop: '10px' }}
              >
                Importer des données
              </button>
            </p>
          </div>
        )}

        {/* Statistiques générales */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="label">Nombre de factures</div>
            <div className="value">{totalInvoices}</div>
          </div>
          <div className="stat-card">
            <div className="label">Nombre de clients</div>
            <div className="value">{totalCustomers}</div>
          </div>
          <div className="stat-card">
            <div className="label">Montant total</div>
            <div className="value">{totalAmount.toFixed(2)} €</div>
          </div>
          <div className="stat-card">
            <div className="label">Moyenne par facture</div>
            <div className="value">{averageAmount.toFixed(2)} €</div>
          </div>
        </div>

        {/* Résumé financier - affiché uniquement s'il y a des données */}
        {totalInvoices > 0 && (
          <div style={{ marginTop: '30px' }}>
            <h3 style={{ color: '#000000', marginBottom: '20px' }}>
              Résumé financier
            </h3>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="label">Total TTC</div>
                <div className="value">{totalAmount.toFixed(2)} €</div>
              </div>
              <div className="stat-card success">
                <div className="label">Total encaissé</div>
                <div className="value">{totalPaid.toFixed(2)} €</div>
              </div>
              <div className="stat-card" style={{ borderColor: '#dc3545' }}>
                <div className="label">Montant dépassement</div>
                <div className="value" style={{ color: '#dc3545' }}>
                  {totalDepassement.toFixed(2)} €
                </div>
              </div>
              <div className="stat-card" style={{ borderColor: '#ffc107' }}>
                <div className="label">Total cashback</div>
                <div className="value" style={{ color: '#ffc107' }}>
                  {totalCashback.toFixed(2)} €
                </div>
              </div>
              <div className="stat-card" style={{ borderColor: '#17a2b8' }}>
                <div className="label">Total encaissé - cashback</div>
                <div className="value" style={{ color: '#17a2b8' }}>
                  {totalEncaisseMoinsCashback.toFixed(2)} €
                </div>
              </div>
              <div className="stat-card error">
                <div className="label">Total restant</div>
                <div className="value">{totalRestantGlobal.toFixed(2)} €</div>
              </div>
            </div>
          </div>
        )}

        {/* Détails par mois - affiché uniquement s'il y a des données */}
        {monthlyStats.length > 0 && (
          <div style={{ marginTop: '30px' }}>
            <h3 style={{ color: '#000000', marginBottom: '20px' }}>
              Détails par mois
            </h3>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Mois</th>
                    <th>Nombre de factures</th>
                    <th>Total facturé</th>
                    <th>Montant payé</th>
                    <th>Montant restant</th>
                    <th>Taux de paiement</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyStats.map((stat, index) => (
                    <React.Fragment key={index}>
                      <tr
                        onClick={() => toggleMonth(stat.month)}
                        style={{ cursor: 'pointer' }}
                        title="Cliquez pour voir le détail des factures"
                      >
                        <td><strong>{expandedMonth === stat.month ? '▼' : '▶'} {stat.month}</strong></td>
                        <td>{stat.count}</td>
                        <td>{stat.total.toFixed(2)} €</td>
                        <td style={{ color: '#28a745' }}>{stat.paye.toFixed(2)} €</td>
                        <td style={{ color: '#dc3545' }}>{stat.restant.toFixed(2)} €</td>
                        <td>
                          {stat.total > 0 ? ((stat.paye / stat.total) * 100).toFixed(1) : 0}%
                        </td>
                      </tr>

                      {expandedMonth === stat.month && (
                        <tr>
                          <td colSpan="6" style={{ background: '#f8f9fa', padding: '15px' }}>
                            <table style={{ width: '100%' }}>
                              <thead>
                                <tr>
                                  <th>N° Facture</th>
                                  <th>Date</th>
                                  <th>Client</th>
                                  <th>Total</th>
                                  <th>Payé</th>
                                  <th>Restant</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(invoicesByMonth[stat.month] || []).map(inv => (
                                  <tr key={inv.id}>
                                    <td>{inv.ref}</td>
                                    <td>{inv.date ? new Date(inv.date * 1000 || inv.date).toLocaleDateString('fr-FR') : '-'}</td>
                                    <td>{customers.find(c => c.id === inv.socid)?.name || 'N/A'}</td>
                                    <td>{inv.total.toFixed(2)} €</td>
                                    <td style={{ color: '#28a745' }}>{inv.paye.toFixed(2)} €</td>
                                    <td style={{ color: '#dc3545' }}>{inv.restant.toFixed(2)} €</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
                <tfoot style={{ background: '#f8f9fa', fontWeight: 'bold' }}>
                  <tr>
                    <td><strong>TOTAL</strong></td>
                    <td>{monthlyStats.reduce((sum, s) => sum + s.count, 0)}</td>
                    <td>{monthlyStats.reduce((sum, s) => sum + s.total, 0).toFixed(2)} €</td>
                    <td style={{ color: '#28a745' }}>
                      {monthlyStats.reduce((sum, s) => sum + s.paye, 0).toFixed(2)} €
                    </td>
                    <td style={{ color: '#dc3545' }}>
                      {monthlyStats.reduce((sum, s) => sum + s.restant, 0).toFixed(2)} €
                    </td>
                    <td>
                      {monthlyStats.reduce((sum, s) => sum + s.total, 0) > 0 ? 
                        ((monthlyStats.reduce((sum, s) => sum + s.paye, 0) / 
                          monthlyStats.reduce((sum, s) => sum + s.total, 0)) * 100).toFixed(1) : 0}%
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* Ventes totales par produit */}
        {productSales.length > 0 && (
          <div style={{ marginTop: '30px' }}>
            <h3 style={{ color: '#000000', marginBottom: '20px' }}>
              Ventes totales par produit
            </h3>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Produit</th>
                    <th>Quantité vendue</th>
                    <th>Total HT</th>
                    <th>Total TTC</th>
                  </tr>
                </thead>
                <tbody>
                  {productSales.map((prod, index) => (
                    <React.Fragment key={index}>
                      <tr
                        onClick={() => toggleProduct(prod.ref)}
                        style={{ cursor: 'pointer' }}
                        title="Cliquez pour voir le détail des ventes"
                      >
                        <td><strong>{expandedProduct === prod.ref ? '▼' : '▶'} {prod.label}</strong></td>
                        <td>{prod.quantite}</td>
                        <td>{prod.totalHT.toFixed(2)} €</td>
                        <td>{prod.totalTTC.toFixed(2)} €</td>
                      </tr>

                      {expandedProduct === prod.ref && (
                        <tr>
                          <td colSpan="4" style={{ background: '#f8f9fa', padding: '15px' }}>
                            <table style={{ width: '100%' }}>
                              <thead>
                                <tr>
                                  <th>N° Facture</th>
                                  <th>Qté</th>
                                  <th>PU HT</th>
                                  <th>Remise</th>
                                  <th>TVA</th>
                                  <th>Total TTC</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(linesByProduct[prod.ref] || []).map((line, i) => (
                                  <tr key={i}>
                                    <td>{line.invoiceRef}</td>
                                    <td>{line.qty}</td>
                                    <td>{line.subprice.toFixed(2)} €</td>
                                    <td>{line.remise}%</td>
                                    <td>{line.tva}%</td>
                                    <td>{line.totalTTC.toFixed(2)} €</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
                <tfoot style={{ background: '#f8f9fa', fontWeight: 'bold' }}>
                  <tr>
                    <td><strong>TOTAL</strong></td>
                    <td>{productSales.reduce((sum, p) => sum + p.quantite, 0)}</td>
                    <td>{productSales.reduce((sum, p) => sum + p.totalHT, 0).toFixed(2)} €</td>
                    <td>{productSales.reduce((sum, p) => sum + p.totalTTC, 0).toFixed(2)} €</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* Suivi des règlements avec remise (tracés en SQLite) */}
        {Object.keys(reglementsByInvoice).length > 0 && (
          <div style={{ marginTop: '30px' }}>
            <h3 style={{ color: '#000000', marginBottom: '20px' }}>
              Suivi des règlements (remises conservées)
            </h3>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>N° Facture</th>
                    <th>Total TTC</th>
                    <th>Payé</th>
                    <th>Cashback</th>
                    <th>Restant</th>
                    <th>Dépassement</th>
                    <th>Date d'annulation</th>
                    <th>Remboursement</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(reglementsByInvoice).map(([invoiceId, r]) => {
                    const invoice = invoices.find(inv => String(inv.id) === String(invoiceId));
                    const remboursement = remboursementsByInvoice[invoiceId];
                    const remboursementAnnule = remboursementsAnnulesByInvoice[invoiceId];
                    const isRembourse = !!remboursement;

                    // Si un remboursement a été annulé, seul le pourcentage calculé est retourné au cashback
                    const payeAffiche = isRembourse ? r.montant_remise : r.montant_paye_reel;
                    const cashbackAffiche = isRembourse
                      ? 0
                      : (remboursementAnnule ? remboursementAnnule.cashback_retourne : r.montant_remise);
                    const couvertAffiche = payeAffiche + cashbackAffiche;
                    const restantAffiche = Math.max(0, r.montant_original - couvertAffiche);
                    const montantRembourseAffiche = isRembourse ? remboursement.montant_rembourse : 0;

                    const detail = getDetailReglements(invoiceId, r.montant_original);

                    return (
                      <React.Fragment key={invoiceId}>
                        <tr
                          onClick={() => toggleReglementInvoice(invoiceId)}
                          style={{ cursor: 'pointer' }}
                          title="Cliquez pour voir le détail des versements"
                        >
                          <td>
                            <strong>{expandedReglementInvoice === invoiceId ? '▼' : '▶'} {invoice?.ref || invoiceId}</strong>
                          </td>
                          <td>{r.montant_original.toFixed(2)} €</td>
                          <td style={{ color: '#28a745' }}>{payeAffiche.toFixed(2)} €</td>
                          <td style={{ color: '#ffc107' }}>
                            {cashbackAffiche.toFixed(2)} €
                            {remboursementAnnule && (
                              <div style={{ fontSize: '11px', color: '#999' }}>
                                ({remboursementAnnule.pourcentage_retourne}% retourné)
                              </div>
                            )}
                          </td>
                          <td style={{ color: Math.abs(restantAffiche) < 0.01 ? '#28a745' : '#dc3545' }}>
                            {restantAffiche.toFixed(2)} €
                          </td>
                          <td style={{ color: r.montant_depassement > 0 ? '#dc3545' : '#999' }}>
                            {r.montant_depassement > 0 ? `${r.montant_depassement.toFixed(2)} €` : '—'}
                          </td>
                          <td>
                            {remboursementAnnule ? (
                              <span style={{ color: '#dc3545' }} title={`${remboursementAnnule.pourcentage_retourne}% du cashback rendu`}>
                                {new Date(remboursementAnnule.date_annulation).toLocaleDateString('fr-FR')}
                              </span>
                            ) : '—'}
                          </td>
                          <td onClick={(e) => e.stopPropagation()}>
                            {isRembourse ? (
                              <span style={{ color: '#17a2b8', fontWeight: 'bold' }}>
                                {montantRembourseAffiche.toFixed(2)} €
                              </span>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', alignItems: 'flex-start' }}>
                                <input
                                  type="date"
                                  value={dateRemboursementByInvoice[invoiceId] || ''}
                                  onChange={(e) =>
                                    setDateRemboursementByInvoice(prev => ({ ...prev, [invoiceId]: e.target.value }))
                                  }
                                  style={{ fontSize: '12px', padding: '3px' }}
                                />
                                <button
                                  className="btn btn-secondary"
                                  onClick={(e) => handleRembourser(e, invoiceId, invoice?.ref || invoiceId, r)}
                                  disabled={!dateRemboursementByInvoice[invoiceId]}
                                  style={{ fontSize: '12px', padding: '5px 10px' }}
                                >
                                   Rembourser
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>

                        {expandedReglementInvoice === invoiceId && (
                          <tr>
                            <td colSpan="8" style={{ background: '#f8f9fa', padding: '15px' }}>
                              <table style={{ width: '100%' }}>
                                <thead>
                                  <tr>
                                    <th>Date</th>
                                    <th>Montant versé</th>
                                    <th>% remise</th>
                                    <th>Couvert</th>
                                    <th>Remise</th>
                                    <th>Dépassement</th>
                                    <th>Restant après</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {detail.map((d, i) => (
                                    <tr key={i}>
                                      <td>{d.date_paiement || '-'}</td>
                                      <td>{parseFloat(d.montant_paye_reel || 0).toFixed(2)} €</td>
                                      <td>{parseFloat(d.pourcentage_remise || 0).toFixed(2)}%</td>
                                      <td>{parseFloat(d.montant_couvert || 0).toFixed(2)} €</td>
                                      <td style={{ color: '#ffc107' }}>{parseFloat(d.montant_remise || 0).toFixed(2)} €</td>
                                      <td style={{ color: parseFloat(d.montant_depassement || 0) > 0 ? '#dc3545' : '#999' }}>
                                        {parseFloat(d.montant_depassement || 0) > 0 ? `${parseFloat(d.montant_depassement).toFixed(2)} €` : '—'}
                                      </td>
                                      <td style={{ fontWeight: 'bold', color: d.restantApres <= 0.01 ? '#28a745' : '#dc3545' }}>
                                        {d.restantApres.toFixed(2)} €
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
                <tfoot style={{ background: '#f8f9fa', fontWeight: 'bold' }}>
                  <tr>
                    <td><strong>TOTAL</strong></td>
                    <td>{Object.values(reglementsByInvoice).reduce((s, r) => s + r.montant_original, 0).toFixed(2)} €</td>
                    <td style={{ color: '#28a745' }}>
                      {Object.entries(reglementsByInvoice).reduce((s, [id, r]) => {
                        const isR = !!remboursementsByInvoice[id];
                        return s + (isR ? r.montant_remise : r.montant_paye_reel);
                      }, 0).toFixed(2)} €
                    </td>
                    <td style={{ color: '#ffc107' }}>
                      {Object.entries(reglementsByInvoice).reduce((s, [id, r]) => {
                        const isR = !!remboursementsByInvoice[id];
                        return s + (isR ? 0 : r.montant_remise);
                      }, 0).toFixed(2)} €
                    </td>
                    <td>
                      {Object.entries(reglementsByInvoice).reduce((s, [id, r]) => {
                        const isR = !!remboursementsByInvoice[id];
                        const paye = isR ? r.montant_remise : r.montant_paye_reel;
                        const cashback = isR ? 0 : r.montant_remise;
                        return s + Math.max(0, r.montant_original - paye - cashback);
                      }, 0).toFixed(2)} €
                    </td>
                    <td style={{ color: '#dc3545' }}>
                      {Object.values(reglementsByInvoice).reduce((s, r) => s + r.montant_depassement, 0).toFixed(2)} €
                    </td>
                    <td>—</td>
                    <td style={{ color: '#17a2b8' }}>
                      {Object.values(remboursementsByInvoice).reduce((s, r) => s + r.montant_rembourse, 0).toFixed(2)} €
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* Liste des factures récentes - affiché uniquement s'il y a des données */}
        {invoices.length > 0 && (
          <div style={{ marginTop: '30px' }}>
            <h3 style={{ color: '#000000', marginBottom: '20px' }}>
              Dernières factures
            </h3>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>N° Facture</th>
                    <th>Date</th>
                    <th>Montant HT</th>
                    <th>Taxe</th>
                    <th>Total TTC</th>
                    <th>Payé</th>
                    <th>Dépassement</th>
                    <th>Cashback</th>
                    <th>Solde dû</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.slice(0, 10).map((invoice) => {
                    const totalHT = parseFloat(invoice.total_ht || 0);
                    const totalTTC = parseFloat(invoice.total_ttc || invoice.total_ht || 0);
                    const taxe = totalTTC - totalHT;

                    const paye = paymentsByInvoiceRef.current[invoice.id] || 0;
                    const reglement = reglementsByInvoice[invoice.id];
                    const depassement = reglement?.montant_depassement || 0;
                    const cashback = reglement?.montant_remise || 0;
                    const soldeDu = Math.max(0, totalTTC - paye + cashback);

                    return (
                      <tr key={invoice.id}>
                        <td>{invoice.ref}</td>
                        <td>{invoice.date ? new Date(invoice.date * 1000 || invoice.date).toLocaleDateString('fr-FR') : '-'}</td>
                        <td>{totalHT.toFixed(2)} €</td>
                        <td>{taxe.toFixed(2)} €</td>
                        <td>{totalTTC.toFixed(2)} €</td>
                        <td style={{ color: '#28a745' }}>{paye.toFixed(2)} €</td>
                        <td style={{ color: depassement > 0 ? '#dc3545' : '#999' }}>
                          {depassement > 0 ? `${depassement.toFixed(2)} €` : '—'}
                        </td>
                        <td style={{ color: cashback > 0 ? '#ffc107' : '#999' }}>
                          {cashback > 0 ? `${cashback.toFixed(2)} €` : '—'}
                        </td>
                        <td style={{ color: soldeDu <= 0.01 ? '#28a745' : '#dc3545', fontWeight: 'bold' }}>
                          {soldeDu.toFixed(2)} €
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Indicateurs de performance - affiché uniquement s'il y a des données */}
        {totalInvoices > 0 && (
          <div style={{ marginTop: '30px', padding: '20px', background: '#f8f9fa', borderRadius: '8px' }}>
            <h3 style={{ color: '#000000', marginBottom: '15px' }}>
              Indicateurs de performance
            </h3>
            <div className="grid-2">
              <div>
                <p style={{ margin: '5px 0' }}>
                  <strong>Factures par jour :</strong>{' '}
                  {totalInvoices > 0 ? (totalInvoices / 30).toFixed(1) : 0}
                </p>
                <p style={{ margin: '5px 0' }}>
                  <strong>Montant moyen par mois :</strong>{' '}
                  {monthlyStats.length > 0 ? 
                    (monthlyStats.reduce((sum, s) => sum + s.total, 0) / monthlyStats.length).toFixed(2) : 0} €
                </p>
              </div>
              <div>
                <p style={{ margin: '5px 0' }}>
                  <strong>Clients actifs :</strong>{' '}
                  {customers.filter(c => c.status === 1).length}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;