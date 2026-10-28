# Plan de réalisation — FasoFlow

## Objectif et périmètre

Créer dans ce dépôt `fasoflow/` une marketplace SaaS réelle en français, destinée d’abord au Burkina Faso et aux transactions en XOF, avec trois rôles métier (client, commerçant, livreur) et un rôle d’administration protégé. Le livrable doit inclure l’application publique, les espaces de travail selon le rôle, les données persistantes, les paiements d’abonnement, les politiques de sécurité, la documentation et les vérifications de compilation. Aucun environnement externe ne sera présenté comme configuré sans accès et preuve d’exécution.

## Architecture d’exécution

- **Web client :** React, TypeScript strict, Vite et Tailwind CSS. React Router gère les pages publiques et protégées. Les fonctionnalités sont séparées par domaine (authentification, catalogue, produits, commandes, conversations, livraisons, paiements et abonnements).
- **Données et identité :** Supabase Auth, PostgreSQL, Storage et Realtime, conformément au choix explicite du cahier des charges. Le client utilise uniquement l’URL et la clé `anon`/publishable publiques. Les privilèges sont définis par RLS, contraintes SQL et fonctions PostgreSQL étroites ; les changements de rôle et transitions sensibles ne font jamais confiance au navigateur.
- **Opérations atomiques :** fonctions SQL transactionnelles pour la création cohérente des commandes et l’acceptation exclusive d’une livraison. Les mises à jour de paiement et de droits d’abonnement sont déclenchées par des fonctions serveur et des politiques de base de données, pas par les formulaires clients.
- **Paiements serveur :** fonctions Vercel TypeScript dans `api/payments/` pour la création du checkout et la lecture du statut SasPay. Les secrets restent dans l’environnement serveur. Le retour du navigateur est une indication d’interface, jamais une preuve de paiement. L’endpoint webhook demeure fermé à 503 tant que SasPay n’a pas confirmé son contrat de signature exact. Les paiements manuels restent un parcours de secours soumis à contrôle admin.
- **PWA :** manifeste propre à l’application, icônes et service worker limité aux ressources publiques statiques ; aucune donnée privée, commande ou réponse API authentifiée ne sera mise en cache hors ligne.
- **Livraison :** le dépôt reste autonome sous `/home/ubuntu/fasoflow`. L’URL et les clés Supabase sont vérifiées en lecture seule, mais aucune migration ni écriture n’a été faite ; aucun connecteur d’administration Supabase n’est actif. L’installation est documentée pour SQL Editor sans `SUPABASE_DB_URL`. Le code est préparé pour Vercel et GitHub ; leur configuration et la publication ne seront déclarées réalisées qu’après accès et succès constatés.

## Structure de modules

- `public/` : logo, favicon, icônes PWA, images et manifeste.
- `src/app/` : providers, routeur et composition de l’application.
- `src/components/` : éléments partagés, navigation, formulaires, produits, boutiques, chat et abonnements.
- `src/pages/` : pages publiques, authentification, client, commerçant, livreur, admin et mentions légales.
- `src/features/` : logique par domaine et appels aux services.
- `src/lib/`, `src/types/` et les modules des `src/features/` : client Supabase, utilitaires et modèles, avec services/hooks regroupés près de leurs workflows métier (`src/app/auth.ts`, abonnements et livraisons) pour garder les règles proches de leurs appels.
- `api/payments/` : endpoints serveur compatibles Vercel pour les transactions d’abonnement.
- `supabase/migrations/` : schéma, RLS, Storage, flux de paiement, graines additives et garde-fous de droits d’abonnement jusqu’à `012_serialized_payments.sql`.
- `tests/` : tests unitaires des plans/tarifs et utilitaires ; les parcours SQL/Auth/SasPay réels restent à vérifier après connexion et application des migrations.

## Identité visuelle

**Mouvement :** artisanat contemporain et design éditorial numérique — chaleureux et local, sans folklore décoratif ni surcharge.

**Principes :** (1) confiance visible dans le prix, le vendeur et le statut ; (2) parcours d’achat et de gestion compréhensibles au premier regard ; (3) expression locale sobre et non stéréotypée ; (4) lisibilité, accessibilité et priorité au mobile.

**Philosophie des couleurs :** fond ivoire chaud pour la proximité et le confort ; vert profond comme couleur propriétaire évoquant stabilité et croissance ; terre cuite et safran en accents rappelant l’énergie de marché et les couleurs burkinabè sans reproduire le drapeau à chaque écran ; gris encre pour le texte. Les accents restent réservés aux actions, prix et statuts importants.

**Mise en page :** accueil éditorial avec une recherche immédiatement accessible, une zone de découverte et des appels à l’action par rôle ; catalogue en grilles de produits lisibles et filtres utilisables au pouce ; fiches boutique/produit centrées sur la confiance et la livraison ; tableaux de bord à navigation latérale sur bureau et navigation compacte/mobile. Les surfaces administratives privilégient l’action plutôt qu’une page d’indicateurs générique.

**Éléments signature :** un symbole de marque formé de deux flux reliés dans un panier/chemin stylisé ; des séparateurs ou cadres fins inspirés du tissage ; des pastilles d’état compactes et des prix XOF bien contrastés.

**Interactions et animation :** retours immédiats et explicites, formulaires avec erreurs proches du champ, confirmations après écriture, états de chargement et pages vides utiles. Transitions courtes et discrètes sur menus, cartes et actions (environ 150–220 ms), sans animation nécessaire à la compréhension et avec respect de `prefers-reduced-motion`. L’état d’un paiement n’est jamais animé/présenté comme réussi avant validation serveur.

**Typographie :** titres en Manrope et textes/UI en DM Sans, avec fallbacks système ; niveaux typographiques nettement distincts, corps généreux pour l’usage mobile et chiffres tabulaires pour prix/statistiques.

**Essence :** « Le marché numérique qui rapproche les bonnes boutiques, les clients et les livreurs au Burkina Faso. » Personnalité : fiable, accessible, vivante.

**Voix :** directe, respectueuse et concrète ; CTA descriptifs. Exemples : « Les trouvailles du quartier, réunies au même endroit. » et « Votre boutique est prête à prendre sa place. »

**Logo :** utiliser le logo officiel FasoFlow fourni par l’utilisateur, avec le symbole et le wordmark accompagnés de la signature « Achète. Vends. Ça circule. ». Conserver le PNG original fourni, ses recadrages dédiés au symbole et au wordmark pour une composition nette et accessible dans l’interface, puis dériver les icônes PWA et le favicon du symbole sans texte en petite taille. Ne pas substituer l’identité par un dessin générique.

**Couleur propriétaire :** vert FasoFlow profond `#155B46`, accompagné d’ivoire `#F8F5EC`, terre cuite `#C9503B`, safran `#E0AE3C` et encre `#202721`.

## SasPay — identité et intégration documentée

L’utilisateur a précisé que le fournisseur attendu est **SasPay**, orthographié ainsi, et non SasaPay. La documentation officielle de SasPay consultée indique :

- API marchande à `https://api.saspay.me/api/v1/` avec en-tête `Authorization: Bearer <clé>` ; clés de test `sk_test_…` et de production `sk_live_…`, à conserver exclusivement côté serveur ([introduction](https://docs.saspay.me/api-reference/introduction)).
- Création de checkout hébergé par `POST /checkout-sessions/`, réponse contenant `id`, `checkout_url`, statut et montants ; le schéma documente XOF et un pays ISO dans les exemples ([création checkout](https://docs.saspay.me/api-reference/payments/checkout-create)).
- Vérification de l’état par `GET /checkout-sessions/{id}/status/` ([statut checkout](https://docs.saspay.me/api-reference/payments/checkout-status)).
- Référentiel : Burkina Faso `BF`, devise `XOF`, indicatif `+226`, réseaux `moov_bf` et `orange_bf` ([formats et réseaux](https://docs.saspay.me/api-reference/reference/formats)). Le site officiel affiche aussi le Burkina dans sa couverture ([SasPay](https://saspay.me/)).
- Les webhooks sont administrés dans le tableau de bord. Les docs exigent de valider le timestamp, la signature sur le corps HTTP brut et la comparaison en temps constant ; elles signalent des headers `X-Webhook-*` et une politique de retries ([webhooks](https://docs.saspay.me/api-reference/webhooks)). Leur contrat de signature exact devra être relu directement avant de coder le vérificateur.
- L’exemple officiel du endpoint de statut renvoie l’identifiant de session, les statuts et les références de transaction, mais pas le montant/devise ([statut checkout](https://docs.saspay.me/api-reference/payments/checkout-status)). Une création au résultat incertain est verrouillée contre le retry automatique ; seule une réconciliation par admin, après consultation du compte marchand et saisie de la référence avec note d’audit, peut la résoudre si aucun identifiant de session utilisable n’a été conservé.
- La création d’une session checkout ne prend pas en charge `Idempotency-Key`. FasoFlow protège les doubles soumissions par intention locale, une RPC serveur qui verrouille le profil pendant la vérification/réservation, et un index unique sur tout paiement ouvert par compte ; les sessions connues peuvent être reprises et une issue incertaine passe en réconciliation admin, sans retry aveugle. Toute activation ou réconciliation reprend le même ordre de verrous et refuse une période payante active.

L’API est intégrée au parcours mensuel à prix fixe sans renouvellement automatique. Un paiement n’active l’abonnement qu’après confirmation serveur du statut officiel `PAID` et du résultat `SUCCESS`. Les RPC sérialisent les changements par profil ; les downgrades/renouvellements sont bloqués pendant une période payante non échue. La capacité sandbox, la clé marchande et les paramètres de webhook restent à fournir/valider avant un test réel.

## Contraintes externes

Supabase Auth répond avec les clés stockées dans l’environnement sécurisé, mais la table FasoFlow `plans` est absente et aucun DDL n’a été exécuté. L’API de gestion Supabase n’est pas connectée ; le propriétaire peut appliquer les 12 fichiers par le SQL Editor en suivant `supabase/README_MIGRATIONS.md`, sans chaîne PostgreSQL. SasPay exige encore une clé `sk_test_…` marchande et la validation de la signature webhook ; une clé live n’est pas requise au développement. GitHub/Vercel ne sont pas réputés connectés tant qu’un contrôle réel ne le prouve. Aucun secret n’est placé dans les sources ou le bundle client.
