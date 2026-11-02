# FasoFlow — livrables et critères d’acceptation

Les vérifications publiques précédentes ont confirmé que le site Vercel s’affiche, que les écrans de tarification/authentification/contact sont présents, et que les requêtes sans ligne renvoient zéro produit public et zéro boutique active. Les endpoints Supabase sont reconnus ; des lectures anonymes de plusieurs tables sensibles sont refusées, mais l’historique des migrations et les politiques RLS complètes n’ont pas pu être vérifiés sans accès administratif. Aucun fichier, compte, ligne Supabase, migration ou paramètre d’environnement n’a été modifié durant l’audit. Les critères ci-dessous restent ouverts tant que chaque résultat n’est pas effectivement livré et vérifié.

## 1. Projet, organisation et technologies

- [ ] **Dossier et architecture du dépôt.** Le projet racine est `fasoflow/`. Les éléments FasoFlow sont regroupés à sa racine ; aucun secret, aucune clé privée ni fichier `.env` réel ne va dans GitHub. L’organisation reste claire et adaptée plutôt qu’une collection de fichiers vides. La cible comprend `public/` (logo officiel PNG fourni et recadrages, favicon, images, manifeste et icônes PWA), `src/app/` (App, router, providers), composants UI/layout/produits/boutiques/chat/abonnements, pages publiques/auth/client/merchant/courier/admin/légales, fonctionnalités auth/marketplace/products/orders/deliveries/messaging/payments/subscriptions/notifications/business/intelligence, hooks, lib Supabase/utilitaires/validations, services, types, styles, `main.tsx`, `vite-env.d.ts`, fonctions `api/payments/create.ts`, `verify.ts`, `webhook.ts`, `api/contact.ts`, API Intelligence, migrations Supabase additives, tests unitaires et d’intégration, `.env.example`, `.gitignore`, `index.html`, package et configuration TypeScript/Vite/Vercel/ESLint et README.
- [ ] **Pile et dépendances.** Conserver React, TypeScript strict, Vite et Tailwind ; Supabase Auth, PostgreSQL, Storage et Realtime ; API server-side compatible Vercel. Réutiliser autant que possible le code existant et éviter toute dépendance inutile.
- [ ] **Code serveur.** Les fonctions TypeScript s’exécutent comme fonctions Vercel. Les règles de routage SPA ne masquent jamais `/api/*`. Aucun secret Supabase, SasPay ou IA n’apparaît dans le bundle client.

## 2. Identité visuelle et expérience partagée

- [ ] **Identité originale et responsive.** Style moderne, africain, professionnel, simple et rassurant ; palette inspirée du Burkina sans surcharge. Employer le logo officiel fourni par l’utilisateur et « Achète. Vends. Ça circule. ». Préserver les proportions du symbole/wordmark et dériver favicon/icônes du symbole. Navigation claire ; cartes produit avec photo, prix et vendeur ; formulaires et boutons cohérents ; tableaux de bord adaptés à chaque rôle ; états de chargement, erreurs utiles, confirmations et pages vides conçues ; composants réutilisables ; interface utilisable sur petit écran.
- [ ] **Marketplace publique prioritaire.** Le site de découverte et d’achat est agréable et ne ressemble pas uniquement à un outil d’administration.
- [ ] **PWA.** Application responsive et installable si la mise en œuvre est propre, avec manifeste, icônes et comportement cohérent ; aucune donnée privée/authentifiée, commande ou réponse API sensible n’est mise en cache hors ligne.

## 3. Pages publiques et navigation

- [ ] **Routes publiques reliées :** `/`, `/marketplace`, `/products/:id`, `/shops`, `/shops/:id`, `/categories/:slug`, `/pricing`, `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/contact`, `/terms`, `/privacy`.
- [ ] **Accueil.** Présentation claire, recherche, catégories, produits récents et appels à l’action distincts pour clients, commerçants et livreurs.
- [ ] **Marketplace.** Catalogue, fiches produit et boutique, liste des boutiques, catégories par slug et tarifs ; recherche et filtres fonctionnels.
- [ ] **Pages Auth et légales.** Connexion, inscription, récupération/réinitialisation de mot de passe, confirmation d’e-mail, contact, conditions et confidentialité.

## 4. Authentification, rôles et autorisations

- [ ] **Supabase Auth.** Inscription e-mail/mot de passe, connexion, déconnexion, récupération du mot de passe, confirmation d’adresse, session et redirection vers le tableau de bord du rôle. Google OAuth seulement si les identifiants nécessaires sont déjà disponibles.
- [ ] **Rôles.** À l’inscription, seuls client, commerçant et livreur sont sélectionnables. Les routes protégées exigent une session valide et le rôle adapté.
- [ ] **Admin protégé.** Rôle vérifié côté serveur et RLS. Aucun utilisateur ne peut s’attribuer `admin` par navigateur, inscription ou paramètre client. Aucun mot de passe admin codé en dur.

## 5. Espace client

- [ ] **Tableau de bord client.** Profil, adresses, favoris, panier, commandes, conversations, livraisons, avis et notifications.
- [ ] **Parcours client.** Rechercher produits, consulter boutiques, ajouter au panier, passer commande, discuter avec le commerçant et suivre la commande.
- [ ] **Gratuité et paiement.** Les clients restent gratuits. La validation d’un formulaire ou la création d’une commande n’est jamais présentée comme une preuve de paiement reçu.

## 6. Espace commerçant et boutique

- [ ] **Tableau de bord commerçant.** Vue d’ensemble, boutique, CRUD des produits, photos, descriptions, prix, stocks et catégories, commandes/statuts, messagerie et négociation, avis, statistiques, factures/abonnements et paramètres.
- [ ] **Boutiques et annonces publiques.** Les boutiques publiées sont actives/approuvées et leurs produits publiés apparaissent sur les pages publiques. Distinguer une absence de données d’une erreur API ; afficher un message et une action utiles plutôt qu’un faux catalogue.
- [ ] **Images.** Upload vers Supabase Storage ; règles d’accès convenables. Conserver les objets existants et ne pas élargir publiquement un bucket privé préexistant.
- [ ] **Cause de l’inventaire public vide.** L’audit a trouvé zéro ligne publique visible pour `products` et `shops`. N’injecter aucun produit, boutique ou avis factice. Vérifier que les vraies annonces actives sont lisibles après leur publication et que les requêtes signalent les erreurs RLS/API.

## 7. Espace livreur

- [ ] **Tableau de bord livreur.** Profil, disponibilité, demandes de course, acceptation/refus, détails, messagerie autorisée, mise à jour de statut, historique, statistiques de revenus, abonnement et paramètres.
- [ ] **Statuts et concurrence.** Statuts livraison : `pending`, `accepted`, `in_progress`, `delivered`, `cancelled`. Plusieurs livreurs ne peuvent accepter la même course ; opération serveur/transaction sûre.
- [ ] **Géolocalisation prudente.** Demander l’autorisation avant d’utiliser la géolocalisation ; sinon proposer ville/zone. Ne pas simuler ou promettre un suivi GPS permanent non implémenté.

## 8. Espace administrateur

- [ ] **Administration.** Accès seulement aux comptes autorisés ; gestion des utilisateurs/rôles, boutiques, modération des produits/annonces, commandes, courses, abonnements, historique et validation des paiements manuels, signalements et statistiques globales.
- [ ] **Protection.** Attribution du rôle admin réservée à une procédure autorisée, jamais au navigateur ou à une inscription publique.

## 9. Commandes, chat et négociation

- [ ] **Commandes.** Chaque commande conserve le prix, le nom de produit et les quantités snapshot au moment de l’achat, les informations de livraison nécessaires et son statut.
- [ ] **Chat.** Conversations liées à un produit ou une commande ; messages texte ; négociation ; propositions, acceptation/refus ; notifications ; signalement/blocage si nécessaire.
- [ ] **Offres.** Chaque offre et décision est conservée et liée aux bons participants. Accepter un prix ne confirme ni paiement ni livraison.

## 10. Abonnements et règles tarifaires

- [ ] **Règles commerciales exactes.** Aucun essai gratuit. Aucune commission sur ventes/livraisons. Seuls commerçants et livreurs ont des abonnements payants. Clients gratuits. Conserver historique et données après expiration ; désactiver seulement les avantages payants et bloquer les dépassements futurs.
- [ ] **Commerçants.** Starter gratuit avec 20 produits ; Premium 5 000 FCFA/mois avec 200 produits ; Business 15 000 FCFA/mois avec 1 000 produits.
- [ ] **Livreurs.** Starter gratuit ; Premium 2 000 FCFA/mois ; Pro 5 000 FCFA/mois.
- [ ] **Catalogue unique.** Offres, prix, limites et avantages centralisés et cohérents entre code et base.

## 11. SasPay et paiements manuels

- [ ] **SasPay.** Utiliser SasPay (pas SasaPay). La liste officielle des pays indique actuellement `BF` Burkina Faso actif avec devise par défaut `XOF`; cela ne confirme pas le KYC, le scope PAYIN ni les réseaux activés sur le compte marchand. Checkout serveur `POST /checkout-sessions/`, clé avec scope PAYIN, vérification serveur `GET /checkout-sessions/{id}/status/`. Activation seulement si le statut est `PAID` + `transaction_status=SUCCESS`, et si les références/montants concordent avec le paiement enregistré. Ne jamais accepter la seule redirection navigateur.
- [ ] **Idempotence et erreurs.** L’endpoint checkout ne prend pas en charge `Idempotency-Key` ; protéger les intentions côté FasoFlow, verrouiller l’interface, réutiliser les sessions connues et bloquer les issues incertaines au lieu de relancer aveuglément. Historique, erreurs et confirmation doivent être fiables ; pas de renouvellement automatique sans nouvelle autorisation.
- [ ] **Webhook sécurisé.** Utiliser `X-Webhook-Signature` en hexadécimal minuscule, `X-Webhook-Timestamp` Unix en secondes et `X-Webhook-Event`. Vérifier HMAC-SHA256 sur `timestamp + "." + corps_HTTP_brut`, refuser tout horodatage distant de plus de 300 secondes et comparer en temps constant. L’exemple officiel n’inclut pas le checkout ID ; corréler `transaction.success` par le marqueur UUID interne placé par le serveur dans la description, puis lire le détail de transaction SasPay et comparer ID, état `SUCCESS`, flux `INBOUND`, `XOF`, montant attendu et paiement interne. Confirmer aussi le statut de session s’il existe. Vérifier le header et le JSON, dédupliquer les événements et ne jamais activer sur la redirection seule. Si le secret ou la clé API manque, aucune activation webhook ; ne pas configurer le dashboard.
- [ ] **Configuration marchande.** Documenter qu’une clé serveur `SASPAY_API_KEY` avec scope `PAYIN` et un `SASPAY_WEBHOOK_SIGNING_SECRET` doivent être ajoutés au runtime serveur par le propriétaire. Le secret de signature est visible une seule fois à la création/rotation dans le dashboard. Aucun secret n’est modifié ou renseigné pendant cette mission. Ne pas annoncer SasPay opérationnel avant test Sandbox réel.
- [ ] **Secours manuel.** Instructions uniquement lorsqu’elles sont configurées par l’admin. Référence/preuve crée `pending` ; activation seulement après décision admin avec auteur/date. Ne jamais inventer des coordonnées de paiement.

## 12. FasoFlow Business

- [ ] **Espace professionnel commerçant.** Accessible uniquement avec un abonnement Business commerçant actif. Tableau de bord commercial ; produits et stocks ; ventes/commandes ; clients ; dépenses ; historique des mouvements de stock ; chiffre d’affaires ; estimation de bénéfice ; alertes de stock faible ; rapports journaliers, hebdomadaires et mensuels ; graphiques/statistiques ; meilleurs vendeurs et évolution de l’activité.
- [ ] **Calculs fondés sur les données réelles.** Utiliser les données enregistrées dans Supabase. Distinguer explicitement valeur des commandes, commandes livrées mais non réglées et paiements confirmés. Ne jamais afficher une commande comme encaissement. Indiquer « estimation » et les coûts manquants lorsqu’une marge ou un bénéfice ne peut pas être déterminé complètement.
- [ ] **Coût et snapshots privés.** Saisir facultativement le coût d’achat dans `product_costs` et capturer ce coût dans `order_item_costs` lors des nouvelles commandes ; les commandes historiques sans coût ne sont pas reconstituées arbitrairement. Ne jamais placer ces valeurs dans `products` ni `order_items`, dont les lectures peuvent inclure des clients. Seuls le commerçant propriétaire avec un abonnement Business actif et l’admin autorisé peuvent les consulter.
- [ ] **Dépenses et stock.** Les dépenses sont rattachées à la boutique et accessibles uniquement à son commerçant Business actif et à l’admin autorisé. Journaliser les ajouts, corrections et sorties de stock ; conserver l’historique et les anciennes données.
- [ ] **Migrations Business.** Fournir des migrations additives et documentées pour les tables privées/fonctions/RLS nécessaires, avec vérification SQL du plan Business actif, sans exposer de coût aux clients ou à d’autres abonnements. Ne pas appliquer en production avant vérification de l’historique, sauvegarde et autorisation distincte.

## 13. FasoFlow Intelligence

- [ ] **Fonctions assistant.** Générer des descriptions de produits, améliorer les annonces, suggérer les prix, analyser les ventes et stocks, proposer des recommandations commerciales, produire des alertes intelligentes et des résumés quotidiens/hebdomadaires.
- [ ] **Architecture provider-neutral et tier.** Appels exclusivement côté serveur derrière une interface qui permet de changer de fournisseur sans refaire le frontend. FasoFlow Intelligence est incluse dans l’offre Business existante, sans modifier prix ni limites ; écran et API vérifient un abonnement commerçant Business actif. Ne pas appeler ou afficher une réponse simulée si la clé fournisseur est absente ; l’interface indique clairement que l’IA doit être configurée.
- [ ] **Isolation des boutiques.** Vérifier côté serveur l’identité, le rôle commerçant, l’entitlement actif et la propriété de la boutique. Chaque requête n’inclut que les données de cette boutique ; limiter les lignes/taille ; exclure coordonnées et données personnelles des clients. Aucune clé IA dans le navigateur.
- [ ] **Configuration restante.** Documenter dans `.env.example` les noms facultatifs côté serveur, sans valeur réelle, et expliquer précisément à l’exploitant ce qu’il restera à configurer. Ne modifier aucune variable d’environnement réelle.

## 14. Sécurité, formulaire de contact et données

- [ ] **Contact anti-abus.** Valider côté serveur nom, e-mail, sujet et message ; ajouter honeypot et limitation de débit persistante ; ne pas accepter une requête publique non contrôlée en insertion directe depuis le navigateur. Conserver les messages existants.
- [ ] **RLS, Storage et opérations sensibles.** Commerçants limités à leur boutique ; clients à leurs commandes ; livreurs seulement aux courses autorisées ; chat réservé aux participants ; paiements/abonnements non falsifiables côté client ; opérations admin protégées. Ne jamais désactiver RLS ni exposer `service_role`.
- [ ] **Migrations non destructives.** Ne jamais supprimer table, ligne ou historique ; ne jamais lancer 001–012 à l’aveugle. Toute migration nouvelle reste locale pendant cette mission. Vérifier les versions et politiques réelles avant de proposer une application.

## 15. Pages légales et expérience mobile

- [ ] **Conditions et confidentialité.** Améliorer les pages légales sans fabriquer l’identité, les coordonnées, les engagements ou la politique de conservation de l’exploitant. Signaler clairement les informations officielles encore nécessaires avant publication définitive.
- [ ] **Design/performance.** Interface moderne et professionnelle, priorité téléphone, navigation simple, tableaux de bord lisibles, graphiques compréhensibles, chargement rapide, erreurs explicites, états de chargement et notifications. Optimiser les images existantes et ne pas ajouter de visuels fictifs.

## 16. Documentation, variables, GitHub et Vercel

- [x] **Variables.** `.env.example` documente les variables sans secret réel. `.env.local` reste ignoré. Aucun secret ne commence par `VITE_`. Ne changer aucun nom, aucune valeur ou portée d’environnement existante. Documenter à part toute nouvelle configuration facultative IA/webhook. Vérification faite : aucun nom ou valeur existant de variable active n’a changé.
- [x] **README.** Documenter installation, commandes, schéma/migrations, règles RLS, coûts et rapports, IA, SasPay, contact anti-spam, tests, limites et étapes d’activation par le propriétaire. Réconcilier la documentation historique sur Supabase avec les preuves actuelles sans prétendre connaître l’historique des migrations.
- [x] **Conservation des services.** Conserver le projet, dépôt GitHub et site Vercel existants. Aucune poussée, aucune reconfiguration GitHub/Vercel et aucun déploiement dans cette intervention locale.

## 17. Exécution et livraison

- [x] **Vérifications de code.** Les 40 tests passent ; TypeScript, ESLint et build Vite passent. Les routes, calculs, signature HMAC, garde-fous tenantés et le manifeste ont été contrôlés sans écrire dans Supabase.
- [ ] **Contrôle visuel responsive.** Vérifier le rendu sur téléphone et desktop dans un navigateur ; non effectué durant cette intervention.
- [x] **Pas de fausses données.** Ne pas semer de produits, commandes, dépenses, mouvements, avis, clients ou réponses IA fictifs pour donner une impression de fonctionnement réel. Aucun repli d’annonces fictives ni aucune donnée d’activité n’a été ajouté.
- [x] **Livrables et blocages.** Code local et migrations préparées ; statut réel SasPay et Supabase ; nom exact des secrets à configurer ultérieurement ; informations légales à fournir ; tests réellement passés. Ne pas prétendre qu’un dépôt, une politique, un paiement ou un déploiement a été modifié sans preuve.
- [x] **Limites d’autorisation.** Cette mission autorise les modifications locales de fichiers et la préparation des migrations SQL. Elle n’autorise pas de modifier les variables/environnements, d’écrire dans Supabase, d’appliquer une migration en production, de créer/modifier des données de production, de pousser un commit susceptible de déclencher Vercel, ni de déployer. Ces actions nécessitent une autorisation distincte. Ces actions n’ont pas été effectuées.

## 18. Préparation multi-marché

- [x] **Configuration centralisée.** Le marché actif BF/XOF, la langue française, le fuseau `Africa/Ouagadougou` et les libellés sont fournis par `src/lib/market.ts` et utilisés par le formatage monétaire ; aucun autre pays n’est activé dans cette version. Tests du registre et du formatage réussis.
- [ ] **Extension future contrôlée.** L’ajout d’un marché doit définir pays, devise, format monétaire, langue/fuseau, paiements, livraison, plans et mentions légales selon des données officiellement validées ; ne pas appliquer de migration ou promettre un service avant revue et autorisation.

## 19. État de livraison local — 2026-11-02

- Les tests locaux réussissent : 40 tests dans 10 fichiers ; TypeScript, ESLint et build Vite réussissent sans avertissement.
- `GET /` et `GET /manus-routes.json` répondent HTTP 200 dans l’aperçu local ; le manifeste valide 33 routes, dont Business et Intelligence.
- Le contrôle public Supabase avait retourné zéro fiche produit et boutique visible. Cela confirme l’absence de lignes publiques, mais ne permet pas de distinguer table vide, enregistrements non publiés ou masqués par RLS sans accès administrateur. Le code sépare désormais une liste vide d’une erreur et ne remplace pas les résultats par des produits fictifs.
- SasPay documente BF actif avec XOF dans la liste publique des pays. Le scope PAYIN du compte marchand, ses réseaux réellement activés, le secret de signature du webhook et un test sandbox n’ont pas été confirmés.
- Le fournisseur IA et sa clé serveur ne sont pas configurés ; aucun résultat n’est simulé. Les coordonnées légales de l’exploitant restent à fournir.
- Les migrations 013/014 sont préparées localement seulement. Aucune migration ni écriture de données n’a été appliquée à Supabase ; aucun changement de variable réelle, commit/push GitHub ou déploiement Vercel n’a été effectué.
- Le rendu visuel sur appareils mobiles n’a pas été vérifié dans un navigateur ; cette étape reste ouverte.
