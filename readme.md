# NewApp — Gestion des factures, paiements, remises et remboursements

## Description

**NewApp** est une application web permettant de gérer et suivre les factures, les paiements, les remises commerciales, les remboursements et les échéanciers de paiement.

L'application est composée de deux parties principales :

* **Backoffice** : administration, importation des données, suivi des factures, configuration des remises et gestion des remboursements.
* **Frontoffice client** : consultation des produits, gestion du panier, création de factures et règlement des factures.

L'application communique avec **Dolibarr** pour récupérer et modifier les données commerciales telles que les clients, produits, factures, lignes de factures et paiements.

Une base de données **SQLite** locale est également utilisée pour conserver les règles de remise, le suivi des règlements, les remboursements et les échéanciers.

---

## Architecture du projet

Le projet utilise une architecture séparant le frontend et le backend :

```text
NewApp/
│
├── Data/
│   ├── import-data-série4 - detail_facture.csv
│   ├── import-data-série4 - facture.csv
│   └── import-data-série4 - paiement.csv
│
├── public/
│   └── index.html
│
├── src/
│   ├── components/
│   ├── context/
│   ├── pages/
│   ├── services/
│   ├── styles/
│   ├── App.jsx
│   └── index.js
│
├── server/
│   ├── db.js
│   ├── index.js
│   ├── discounts.db
│   ├── package.json
│   └── package-lock.json
│
├── .env
├── .gitignore
├── package.json
├── package-lock.json
└── README.md
```

---

## Technologies utilisées

### Frontend

* React 18
* React Router DOM
* Axios
* PapaParse
* CSS
* Create React App

### Backend

* Node.js
* Express.js
* CORS
* SQLite
* API REST

### Système externe

* Dolibarr ERP/CRM
* API REST Dolibarr

---

## Fonctionnalités principales

### 1. Authentification Backoffice

Le backoffice est protégé par un système d'accès.

L'accès aux fonctionnalités d'administration nécessite un code configuré dans les variables d'environnement.

Les routes protégées comprennent notamment :

```text
/dashboard
/importation
/reinitialisation
/configuration-remise
/liste-remboursement
```

L'état d'authentification est conservé dans :

```text
sessionStorage
```

avec la clé :

```text
backoffice_auth
```

---

## 2. Importation des données

L'application permet d'importer trois fichiers CSV :

### Factures

```text
num_facture
date_facture
date_limite_reglement
code_client
nom_client
```

### Détails des factures

```text
ref_detail
num_facture
ref_produit
produit
quantite
pu_hors_Taxe
taxe
remise
```

### Paiements

```text
ref_detail
date_reglement
caisse
montant
```

Les fichiers sont sélectionnés depuis l'interface puis analysés avant leur importation.

Les données importées sont temporairement conservées dans le navigateur avant le traitement.

---

## 3. Visualisation avant importation

Avant l'importation dans Dolibarr, l'application affiche un aperçu des données :

* Factures
* Détails des factures
* Paiements

L'utilisateur peut ainsi vérifier les données avant de lancer l'importation.

L'importation affiche également une progression ainsi que :

* le nombre d'éléments importés avec succès ;
* le nombre d'erreurs ;
* le détail des erreurs rencontrées.

---

## 4. Dashboard

Le dashboard permet de consulter les informations provenant de Dolibarr.

Il permet notamment de suivre :

* les factures ;
* les clients ;
* les paiements ;
* les ventes ;
* les statistiques mensuelles ;
* les ventes par produit ;
* les règlements ;
* les remises calculées ;
* les remboursements.

Les données sont regroupées afin de faciliter le suivi de l'activité.

---

## 5. Gestion des remises

Le système permet de définir des règles de remise en fonction du délai de règlement.

Une règle possède notamment :

```text
label
jours_min
jours_max
pourcentage
ordre
jour_debut
jour_fin
```

Exemple :

| Règle           | Jours min | Jours max | Remise |
| --------------- | --------: | --------: | -----: |
| Paiement rapide |         0 |         7 |   15 % |
| Paiement normal |         8 |        30 |   10 % |
| Paiement tardif |        31 |         ∞ |    0 % |

Les règles peuvent être :

* ajoutées ;
* modifiées ;
* supprimées ;
* appliquées automatiquement lors du calcul d'une remise.

Le système permet également de limiter une règle à une période du mois.

Exemple :

```text
Jour début : 1
Jour fin   : 15
```

La règle est alors active pendant la première quinzaine du mois.

Les intervalles traversant la fin du mois sont également pris en charge.

Exemple :

```text
28 → 5
```

signifie que la règle est active du 28 jusqu'au 5 du mois suivant.

---

## 6. Gestion des règlements

Les règlements sont suivis dans la base SQLite.

Le système conserve notamment :

* le montant original ;
* le montant réellement payé ;
* le montant de la remise ;
* le pourcentage de remise ;
* le montant couvert ;
* le montant dépassant le montant dû ;
* la date du paiement.

Cela permet de distinguer le montant réellement encaissé du montant couvert après application d'une remise.

---

## 7. Frontoffice client

Le projet dispose également d'une interface destinée aux clients.

### Connexion client

Le client peut accéder à la boutique après authentification.

Route :

```text
/client-login
```

### Produits

Les produits disponibles dans Dolibarr sont récupérés et affichés dans la boutique.

Route :

```text
/boutique/produits
```

Le client peut notamment consulter :

* la référence ;
* le nom du produit ;
* le prix ;
* le prix maximum TTC ;
* les quantités disponibles pour le panier.

---

## 8. Panier

Le client peut ajouter des produits à son panier.

Route :

```text
/boutique/panier
```

Le panier permet de gérer :

* les produits ;
* les quantités ;
* les différents niveaux de prix ;
* le prix maximum TTC ;
* les remises ;
* les sous-totaux ;
* le montant total.

Le panier utilise un contexte React :

```text
CartContext
```

---

## 9. Paiement

Après validation du panier, une facture est créée dans Dolibarr.

Le client peut ensuite procéder au règlement.

Route :

```text
/boutique/paiement
```

Le système calcule automatiquement la remise applicable en fonction :

* de la date de la facture ;
* de la date de paiement ;
* du nombre de jours écoulés ;
* des règles configurées dans le backoffice.

Le paiement peut être effectué via différentes caisses configurées dans l'application.

---

## 10. Échéancier de paiement

L'application permet également de générer un échéancier.

Route :

```text
/boutique/generer-paiement
```

L'utilisateur peut définir :

* le montant total ;
* le nombre de paiements ;
* l'intervalle entre les paiements ;
* la date de début ;
* la caisse utilisée.

Le système génère automatiquement les différentes échéances.

La dernière échéance récupère le reliquat éventuel provoqué par les arrondis.

Exemple :

```text
Total : 100 €

3 paiements

Échéance 1 : 33,33 €
Échéance 2 : 33,33 €
Échéance 3 : 33,34 €
```

---

## 11. Remboursements

Les remboursements sont enregistrés et suivis dans le système.

La page :

```text
/liste-remboursement
```

permet de consulter les remboursements actifs.

Pour chaque remboursement, l'application affiche notamment :

* la facture concernée ;
* le montant remboursé ;
* le cashback conservé ;
* la date du remboursement.

Un remboursement peut également être annulé.

Lors de l'annulation, le système calcule automatiquement le pourcentage de cashback à restituer en fonction des règles de remise configurées.

---

## 12. Réinitialisation

La page :

```text
/reinitialisation
```

est prévue pour supprimer les données importées.

La réinitialisation concerne notamment :

* les factures ;
* les lignes de factures ;
* les clients associés ;
* les paiements associés selon les possibilités offertes par l'API Dolibarr.

Cette opération doit être utilisée avec précaution car la suppression des données peut être irréversible.

---

# Base de données SQLite

Le backend utilise SQLite avec le fichier :

```text
server/discounts.db
```

La base est initialisée automatiquement par :

```text
server/db.js
```

Les principales tables sont :

### `discount_rules`

Contient les règles de remise.

```text
id
label
jours_min
jours_max
pourcentage
ordre
jour_debut
jour_fin
```

### `reglements`

Contient le suivi des règlements.

```text
id
invoice_id
invoice_ref
montant_original
montant_paye_reel
montant_remise
pourcentage_remise
date_paiement
montant_couvert
montant_depassement
date_creation
```

### `echeanciers`

Contient les échéanciers associés aux factures.

### `echeances`

Contient les différentes échéances d'un échéancier.

Les colonnes supplémentaires peuvent être ajoutées automatiquement par le mécanisme de migration présent dans `db.js`.

---

# Communication avec Dolibarr

L'application utilise l'API REST de Dolibarr pour communiquer avec le système ERP.

Les opérations concernent notamment :

```text
Clients
Produits
Factures
Lignes de factures
Paiements
```

Les services frontend responsables de ces échanges se trouvent principalement dans :

```text
src/services/api.js
src/services/importService.js
src/services/frontofficeService.js
```

---

# Organisation du code

## `src/components`

Contient les composants React réutilisables.

```text
Layout.jsx
Navigation.jsx
ProtectedRoute.jsx
ProtectedClientRoute.jsx
```

## `src/context`

Contient les contextes React.

```text
CartContext.jsx
ClientContext.jsx
```

Ils permettent notamment de partager :

* les informations du client connecté ;
* le contenu du panier.

## `src/pages`

Contient les différentes pages de l'application.

### Backoffice

```text
BackofficeLogin.jsx
Dashboard.jsx
Importation.jsx
Visualisation.jsx
ConfigurationRemise.jsx
ListeRemboursement.jsx
Reinitialisation.jsx
```

### Frontoffice

```text
frontoffice/
├── ClientLogin.jsx
├── Produits.jsx
├── Panier.jsx
├── Paiement.jsx
└── GenererPaiement.jsx
```

## `src/services`

Contient la logique de communication avec les API et les différents traitements.

```text
api.js
discountService.js
frontofficeService.js
importService.js
resetService.js
```

## `src/styles`

Contient les styles globaux :

```text
global.css
```

---

# Installation

## Prérequis

Installer au minimum :

* Node.js
* npm
* Dolibarr accessible via son API REST

Le backend indique une version Node.js minimale de :

```text
Node.js >= 22.5.0
```

---

## Installation du frontend

Depuis la racine du projet :

```bash
npm install
```

Puis :

```bash
npm start
```

Le frontend démarre avec Create React App.

---

## Installation du backend

Se placer dans le dossier `server` :

```bash
cd server
```

Installer les dépendances :

```bash
npm install
```

Puis démarrer le serveur :

```bash
npm start
```

Pour le développement avec redémarrage automatique :

```bash
npm run dev
```

Le backend utilise par défaut le port :

```text
4000
```

---

# Démarrage du projet

Il faut démarrer les deux parties de l'application.

### Terminal 1 — Frontend

```bash
npm start
```

### Terminal 2 — Backend

```bash
cd server
npm start
```

L'application React et le serveur Express doivent fonctionner simultanément.

---

# Configuration

Les paramètres de connexion à Dolibarr et les différents paramètres sensibles doivent être configurés dans les variables d'environnement.

Exemple de structure :

```env
REACT_APP_BACKOFFICE_CODE=1234
```

Les valeurs réelles utilisées dans votre environnement ne doivent pas être publiées dans Git.

Le fichier :

```text
.env
```

doit rester privé lorsqu'il contient des informations sensibles.

---

# Données d'exemple

Le dossier `Data/` contient des fichiers CSV pouvant servir à tester le processus d'importation :

```text
Data/
├── import-data-série4 - detail_facture.csv
├── import-data-série4 - facture.csv
└── import-data-série4 - paiement.csv
```

Ces fichiers permettent de tester respectivement :

* les détails des factures ;
* les factures ;
* les paiements.

---

# 🔄 Flux général de l'application

```text
                    ┌───────────────────┐
                    │      Client       │
                    └─────────┬─────────┘
                              │
                              ▼
                    ┌───────────────────┐
                    │    Frontoffice    │
                    │ Produits / Panier │
                    └─────────┬─────────┘
                              │
                              ▼
                    ┌───────────────────┐
                    │     Facture       │
                    │     Dolibarr      │
                    └─────────┬─────────┘
                              │
                              ▼
                    ┌───────────────────┐
                    │     Paiement      │
                    │ Remise / Cashback │
                    └─────────┬─────────┘
                              │
                              ▼
                    ┌───────────────────┐
                    │ SQLite / Backend  │
                    │ Règlements        │
                    │ Remises           │
                    │ Remboursements    │
                    │ Échéanciers       │
                    └───────────────────┘
```

Pour l'importation :

```text
CSV
 │
 ├── Factures
 ├── Détails
 └── Paiements
        │
        ▼
   Visualisation
        │
        ▼
 Importation Dolibarr
        │
        ▼
    Dashboard
```

---

# Sécurité

Quelques mécanismes de protection sont présents :

* routes backoffice protégées ;
* routes frontoffice client protégées ;
* variables d'environnement pour les paramètres sensibles ;
* séparation frontend/backend ;
* validation de plusieurs paramètres côté frontend et backend.

Pour une utilisation en production, il est recommandé de renforcer notamment :

* l'authentification ;
* la gestion des sessions ;
* les permissions ;
* la protection des API ;
* la gestion des secrets ;
* les contrôles CORS ;
* la validation côté serveur.

---

# Tests

Le frontend utilise Create React App et dispose du script :

```bash
npm test
```

Pour générer une version de production :

```bash
npm run build
```

---

# Routes principales

## Backoffice

| Route                   | Fonction                     |
| ----------------------- | ---------------------------- |
| `/login`                | Connexion backoffice         |
| `/dashboard`            | Tableau de bord              |
| `/importation`          | Importation CSV              |
| `/visualisation`        | Prévisualisation des données |
| `/configuration-remise` | Gestion des règles de remise |
| `/liste-remboursement`  | Gestion des remboursements   |
| `/reinitialisation`     | Réinitialisation             |

## Frontoffice

| Route                        | Fonction                   |
| ---------------------------- | -------------------------- |
| `/client-login`              | Connexion client           |
| `/boutique/produits`         | Liste des produits         |
| `/boutique/panier`           | Panier                     |
| `/boutique/paiement`         | Paiement                   |
| `/boutique/generer-paiement` | Génération d'un échéancier |

---

# Scripts disponibles

## Frontend

```bash
npm start
```

Démarre l'application en mode développement.

```bash
npm run build
```

Génère la version de production.

```bash
npm test
```

Lance les tests.

---

## Backend

Depuis `server/` :

```bash
npm start
```

Démarre le serveur Express.

```bash
npm run dev
```

Démarre le serveur avec Nodemon.

---

# Points importants

* Le backend doit être démarré pour utiliser les fonctionnalités liées aux remises, règlements, remboursements et échéanciers.
* Dolibarr doit être accessible pour les fonctionnalités utilisant ses données.
* La base `server/discounts.db` contient des données applicatives locales et doit être sauvegardée si nécessaire.
* Les fichiers `.env` ne doivent pas être versionnés lorsqu'ils contiennent des secrets.
* La réinitialisation des données doit être utilisée avec précaution.

---

# Structure technologique résumée

```text
React
  │
  ├── React Router
  ├── Context API
  ├── Axios
  ├── PapaParse
  │
  ▼
Express.js
  │
  ├── API REST
  ├── CORS
  └── Logique métier
       │
       ├── SQLite
       │
       └── Dolibarr API
```

---

# Licence

Projet destiné à un usage académique / professionnel interne.

