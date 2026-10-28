# FasoFlow — livrables et critères d’acceptation

Les critères ci-dessous reprennent les exigences utilisateur et restent ouverts tant que leur résultat complet n’est pas vérifié. L’application, les migrations et la documentation ont été créées ; les contrôles TypeScript, lint, tests unitaires et build ont réussi. URL et clés Supabase ont passé un contrôle limité en lecture seule (Auth répond, mais la table `plans` est absente) ; aucune migration ni écriture n’a été exécutée. Les abonnements réels, SasPay en sandbox, Vercel et les parcours complets par rôle restent à tester.

## 1. Projet, organisation et technologies

- [ ] **Dossier et architecture du dépôt.** Le projet racine est `fasoflow/`. Les éléments FasoFlow sont regroupés à sa racine ; aucun secret, aucune clé privée ni fichier `.env` réel ne va dans GitHub. L’organisation reste claire et adaptée plutôt qu’une collection de fichiers vides. La cible comprend `public/` (logo officiel PNG fourni et ses recadrages, favicon, images, manifeste et icônes PWA), `src/app/` (App, router, providers), composants UI/layout/produits/boutiques/chat/abonnements, pages publiques/auth/client/merchant/courier/admin/légales, fonctionnalités auth/marketplace/products/orders/deliveries/messaging/payments/subscriptions/notifications, hooks, lib Supabase/utilitaires/validations, services, types, styles, `main.tsx`, `vite-env.d.ts`, fonctions `api/payments/create.ts`, `verify.ts`, `webhook.ts`, migrations versionnées Supabase, tests unitaires et d’intégration, `.env.example`, `.gitignore`, `index.html`, `package.json`, config TypeScript/Vite/Vercel/ESLint et README.
- [ ] **Pile et dépendances.** Le frontend utilise React, TypeScript en mode strict, Vite et Tailwind. Auth, PostgreSQL, Storage et Realtime utilisent Supabase. Vercel sert au déploiement. GitHub sert au versionnement si l’accès est disponible. SasPay est le prestataire de paiement demandé, sous réserve de ses docs et capacités de compte. Les versions sont compatibles et stables ; les dépendances sont installées, configurées et compilent.
- [ ] **Code serveur Vercel.** Les fonctions TypeScript utilisent un format compatible Vercel, avec configuration particulière si nécessaire, et les règles de routage SPA n’empêchent jamais les fonctions serveur de fonctionner.

## 2. Identité visuelle et expérience partagée

- [ ] **Identité originale et responsive.** Style moderne, africain, professionnel, simple et rassurant ; palette cohérente inspirée du Burkina sans surcharge. Employer le logo officiel fourni par l’utilisateur et sa signature « Achète. Vends. Ça circule. » ; préserver les proportions du symbole et du wordmark et dériver favicon/icônes du symbole pour les petites tailles. Navigation claire ; cartes produits présentant photo, prix et vendeur ; formulaires et boutons cohérents ; tableaux de bord adaptés à chaque rôle ; états de chargement ; erreurs utiles ; confirmations de réussite ; pages vides conçues ; interface utilisable sur petit écran ; composants réutilisables.
- [ ] **Marketplace publique prioritaire.** L’interface ne ressemble pas uniquement à un tableau de bord d’administration ; le site de découverte et d’achat est agréable à utiliser.
- [ ] **PWA si réalisable proprement.** Application responsive et installable comme PWA si la mise en œuvre est propre, avec manifeste, icônes et comportement cohérent.

## 3. Pages publiques et navigation

- [ ] **Toutes les routes publiques sont reliées par une navigation fonctionnelle :** `/`, `/marketplace`, `/products/:id`, `/shops`, `/shops/:id`, `/categories/:slug`, `/pricing`, `/login`, `/signup`, `/forgot-password`, `/contact`, `/terms`, `/privacy`.
- [ ] **Accueil.** Présentation claire, barre de recherche, catégories, produits récents et appels à l’action adaptés aux clients, commerçants et livreurs.
- [ ] **Pages marketplace.** Catalogue de produits, détails produit, liste des boutiques, page boutique, filtres/catégories accessibles par slug et tarifs des abonnements.
- [ ] **Pages d’authentification et légales.** Connexion, inscription, récupération de mot de passe, contact, conditions d’utilisation et politique de confidentialité accessibles.

## 4. Authentification, rôles et autorisations

- [ ] **Supabase Auth.** Inscription par e-mail/mot de passe, connexion, déconnexion, mot de passe oublié, confirmation de l’adresse e-mail, gestion de session et redirection vers le tableau de bord correspondant au rôle. OAuth Google est configuré seulement si les identifiants nécessaires sont disponibles.
- [ ] **Choix de rôle.** À l’inscription, le choix est Client, Commerçant ou Livreur. Les routes protégées exigent une session et le rôle adapté.
- [ ] **Rôle admin protégé.** Le rôle est vérifié côté serveur et par les politiques RLS. Aucun utilisateur ne peut s’attribuer `admin` depuis son navigateur, une inscription publique ou un paramètre client. Aucun mot de passe administrateur n’est codé en dur ; les comptes admin sont affectés par une méthode sécurisée.

## 5. Espace client

- [ ] **Tableau de bord `/client/dashboard`** et pages/accès pour mon profil, mes adresses, favoris, panier, commandes, conversations, livraisons, avis et notifications.
- [ ] **Parcours client.** Le client peut rechercher produits, consulter boutiques, ajouter des produits au panier, passer commande, discuter avec le commerçant et suivre la commande.
- [ ] **Gratuité et paiements.** Le compte client reste gratuit. La validation d’un formulaire ne peut pas être présentée comme une preuve de paiement reçu.

## 6. Espace commerçant

- [ ] **Tableau de bord `/merchant/dashboard`** avec vue d’ensemble, gestion de la boutique, création et modification des produits, upload d’images, prix/stocks/catégories, commandes reçues et statuts, conversations, négociation des prix, avis clients, statistiques de ventes, abonnement/factures et paramètres du compte.
- [ ] **Persistance et photos.** Les données commerçant sont enregistrées dans Supabase. Les images utilisent Supabase Storage avec des règles d’accès appropriées.

## 7. Espace livreur

- [ ] **Tableau de bord `/courier/dashboard`** avec profil et informations utiles, disponibilité, demandes de livraison, acceptation/refus, détails de livraison, chat avec parties autorisées, mise à jour des statuts, historique, statistiques de revenus, abonnement et paramètres.
- [ ] **Statuts et concurrence.** Statuts permis : `pending`, `accepted`, `in_progress`, `delivered`, `cancelled`. Plusieurs livreurs ne peuvent accepter simultanément la même course ; utiliser une opération serveur ou transaction de base de données sûre.
- [ ] **Géolocalisation prudente.** Demander l’autorisation avant géolocalisation. Si indisponible, proposer ville/zone. Ne pas promettre un suivi GPS permanent qui n’est pas réellement implémenté.

## 8. Espace administrateur

- [ ] **Admin autorisé uniquement.** Espace administrateur réservé aux comptes autorisés, offrant gestion des utilisateurs, boutiques, modération produits, commandes, livraisons, validation des paiements manuels, abonnements, historique des transactions, signalements et statistiques générales.
- [ ] **Protection.** Attribution du rôle admin sécurisée, jamais depuis une inscription publique ou un paramètre navigateur ; aucun mot de passe admin codé en dur.

## 9. Produits, commandes, messagerie et négociation

- [ ] **Produits et commandes.** Tables et fonctions nécessaires aux produits, boutiques, commandes et lignes de commande. Chaque commande conserve un prix cohérent au moment de l’achat, les quantités, les informations utiles de livraison et son statut.
- [ ] **Chat.** Messages texte ; conversations rattachées à un produit ou une commande ; négociation ; proposition d’un nouveau prix ; acceptation/refus ; notifications ; signalement et blocage si nécessaire.
- [ ] **Offres négociées.** Chaque nouveau prix accepté/refusé est enregistré en base et lié aux bonnes personnes. L’acceptation d’une offre ne confirme ni le paiement ni la livraison.

## 10. Abonnements, plans et droits

- [ ] **Règles économiques.** Les clients restent gratuits. Commerçants et livreurs disposent d’une offre gratuite. Seuls commerçants et livreurs peuvent choisir un abonnement payant. Aucun essai gratuit. Aucune commission sur les ventes ou livraisons pour le moment. Tous les prix sont exprimés en XOF.
- [ ] **Plans commerçants.** Starter gratuit : boutique, nombre limité de produits, gestion des commandes, messagerie. Premium à 5 000 FCFA/mois : limites produits supérieures, statistiques avancées, promotions, personnalisation de boutique. Business à 15 000 FCFA/mois : limites supérieures, outils d’équipe si implémentés, rapports avancés, gestion avancée du stock.
- [ ] **Plans livreurs.** Starter gratuit : profil, demandes de livraison, messagerie, historique de base. Premium à 2 000 FCFA/mois : statistiques revenus, préférences de livraison, profil enrichi. Pro à 5 000 FCFA/mois : statistiques avancées, outils de disponibilité, options de visibilité supplémentaires sans promesse trompeuse.
- [ ] **Catalogue unique.** Catalogue central des offres dans le code et, si nécessaire, en base. Prix, limites et avantages ne sont pas dupliqués de façon incohérente dans les composants.
- [ ] **Expiration.** À l’expiration, conserver les données et l’historique ; désactiver seulement les fonctionnalités payantes ; empêcher les nouveaux dépassements de limites.

## 11. SasPay — paiement électronique des abonnements

- [ ] **Fournisseur exact et documentation.** Utiliser SasPay (orthographe exacte), pas SasaPay. Avant le code d’intégration, documenter l’API réelle, méthodes de paiement, création du checkout, statut, webhooks, test et exigences du compte marchand. Ne jamais inventer URL, paramètres, méthode d’authentification ou capacités.
- [ ] **Éléments documentés à préserver.** Documentation consultée : clé serveur `sk_test_…` en test et `sk_live_…` en production, Bearer auth ; checkout hébergé `POST https://api.saspay.me/api/v1/checkout-sessions/` ; statut `GET /checkout-sessions/{id}/status/` ; Burkina `BF`, XOF, indicatif `+226`, réseaux `moov_bf` et `orange_bf`. Sources dans `plan.md` et README. Les informations de compte marchand, scope `PAYIN`/`BOTH`, URLs webhook, signature et test réel doivent être vérifiées avant activation.
- [ ] **Création, confirmation et journalisation.** Créer un checkout avec les données d’un plan côté serveur ; sauvegarder la transaction avec identifiant fournisseur et état initial ; à la confirmation authentifiée uniquement, enregistrer la transaction et activer l’abonnement ; gérer échecs/annulations ; protéger contre le traitement double ; journaliser sans fuite de secrets.
- [ ] **Statut et webhooks.** Ne pas prendre la redirection navigateur pour preuve. Valider les webhooks selon la documentation officielle, puis confirmer le statut auprès de SasPay si possible ; conserver une vérification de statut serveur. Respecter le corps brut, la fenêtre anti-rejeu, la comparaison de signature en temps constant et l’idempotence d’événement prévues dans le contrat exact.
- [ ] **Absence d’idempotence checkout native.** La documentation de création de checkout indique que `Idempotency-Key` n’est pas accepté sur cet endpoint. Un double clic/retry peut créer plusieurs sessions, mais ne débite rien avant paiement. Protéger les intentions de paiement côté FasoFlow, verrouiller l’interface pendant l’appel et ne jamais répéter aveuglément une requête dont le résultat est incertain. Le code réserve désormais un checkout ouvert par compte, réutilise une session connue ou bloque une issue incertaine ; la migration 011 ajoute l’unicité en base. Ce garde-fou attend encore un test concurrence sur Supabase et en Sandbox SasPay.
- [ ] **Secrets et capacités de compte.** Secrets API seulement côté serveur, jamais préfixés `VITE_`. Si clé, accès/activation, configuration webhook ou test Sandbox manque, garder le code prêt et nommer exactement ce blocage. Ne jamais prétendre au bon fonctionnement sans test réel.

## 12. Paiement manuel de secours

- [ ] **Parcours administrable et sûr.** Afficher les instructions de paiement configurées par l’administrateur ; permettre à l’utilisateur de soumettre référence et preuve si nécessaire ; créer paiement `pending` ; permettre à l’administrateur de vérifier la transaction ; activer l’abonnement seulement après validation ; enregistrer l’auteur et la date de décision. La migration 011 sérialise les décisions par profil, n’accepte qu’un paiement ouvert par compte et refuse une validation pendant une période payante non échue ; ce flux reste à tester après application.
- [ ] **Pas de coordonnées inventées.** Tant que le propriétaire ne fournit pas les coordonnées, la configuration admin reste vide ; ne pas inventer numéro de paiement ou coordonnées bancaires.

## 13. Supabase, migrations, RLS et Storage

- [ ] **Tables au minimum :** `profiles`, `shops`, `categories`, `products`, `favorites`, `orders`, `order_items`, `conversations`, `conversation_participants`, `messages`, `price_offers`, `deliveries`, `reviews`, `plans`, `subscriptions`, `payments`, `notifications`, `reports`, avec autres tables réellement nécessaires. Ajouter clés étrangères, contraintes, index et horodatages utiles.
- [ ] **RLS.** Utilisateurs voient seulement les données autorisées ; commerçants gèrent leurs boutiques et produits ; clients consultent leurs commandes ; livreurs n’accèdent qu’aux livraisons accessibles ; conversations accessibles uniquement aux participants ; paiements/abonnements non falsifiables par le navigateur ; opérations administratives réservées aux admins.
- [ ] **Storage.** Politiques appropriées pour upload, lecture et suppression des images.
- [ ] **Migrations/données.** Migrations versionnées, reproductibles autant que possible et documentées. Démonstrations séparées des données réelles. Ne jamais désactiver RLS ni mettre `service_role` dans le frontend. Appliquer les migrations à Supabase seulement si accès autorisé ; sinon livrer SQL et instructions d’exécution.

## 14. Environnement, documentation, GitHub et Vercel

- [ ] **Variables.** `.env.example` documente toutes les variables nécessaires sans vrais secrets et respecte la documentation des SDK. `.env.local` est ignoré par Git et le README explique sa création dans le dossier racine. Les variables `VITE_` sont considérées publiques ; aucun secret n’en utilise le préfixe. Secrets de production ajoutés dans Vercel uniquement si l’accès est autorisé.
- [ ] **README.** Décrit prérequis, installation, commandes dev/build, configuration Supabase, migrations SQL, variables d’environnement, SasPay, déploiement Vercel, tests et limites restantes.
- [ ] **Dépôt et hébergement.** Préparer Git à la racine de `fasoflow/`. Si GitHub/Vercel sont accessibles et explicitement autorisés : créer/utiliser un dépôt `fasoflow`, pousser le code complet, configurer le projet Vercel, variables autorisées, déployer et vérifier l’URL de production. Sinon livrer le code et les étapes exactes. Ne jamais prétendre qu’un dépôt, compte, configuration ou déploiement a été fait sans preuve. `vercel.json` est configuré seulement si nécessaire et ne bloque pas `/api`.

## 15. Tests, transparence et livraison finale

- [ ] **Exécution des vérifications exigées.** Installer dépendances, contrôler TypeScript, lint, compilation de production et corriger les erreurs. Vérifier routage, authentification, protection des rôles, règles RLS, produits/commandes/conversations, création/expiration des abonnements, flux SasPay en mode test si disponible, absence de secrets publics et affichage mobile.
- [ ] **Pas de faux statut fonctionnel.** Des données fictives seules ne doivent pas laisser croire que les intégrations sont actives. Indiquer précisément les fonctions qui exigent une configuration externe.
- [ ] **Livrables.** Dossier `fasoflow/` complet ; sources ; migrations SQL et politiques RLS ; `.env.example` ; README complet ; tests et résultat de compilation ; statut réel SasPay et Supabase ; lien GitHub seulement s’il existe ; URL Vercel seulement si déploiement confirmé ; courte liste des actions restantes pour le propriétaire.
- [ ] **Ordre de travail conservé.** Architecture/dossier, frontend, design/pages publiques, Auth/base Supabase, rôles/dashboards, produits/boutiques/commandes/favoris, chat/négociation/livraisons, abonnements/permissions, SasPay et paiement manuel, sécurité/tests/corrections, puis GitHub et Vercel. Si une intégration externe bloque, poursuivre le reste et préparer cette intégration pour qu’elle soit terminée ensuite.
