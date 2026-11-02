# FasoFlow

Marketplace SaaS en français destinée au Burkina Faso : clients, commerçants et livreurs ; montants en XOF/FCFA. Stack : React 18, TypeScript strict, Vite, Tailwind, Supabase Auth/PostgreSQL/Storage/Realtime et fonctions server-side Vercel.

Le marché actif est centralisé dans `src/lib/market.ts` (Burkina Faso, `BF`, XOF, français, `Africa/Ouagadougou`). Cette structure prépare l’ajout futur de marchés sans activer de pays ou devise non validés.

## État actuel et limites

L’application comprend le parcours marketplace, les espaces à rôles, FasoFlow Business et FasoFlow Intelligence. Le catalogue public distingue maintenant une liste réellement vide d’une erreur API et propose les filtres disponibles. Au dernier contrôle public, la base ne contenait aucune boutique ni aucun produit visible ; aucune annonce factice n’est ajoutée. Un commerçant doit créer sa boutique et ses annonces, puis celles-ci doivent être approuvées selon le workflow de modération.

Les requêtes de diagnostic précédentes ont identifié les endpoints Supabase et confirmé que plusieurs données sensibles refusent les accès anonymes. Elles ne permettent pas de confirmer l’historique des migrations, les règles RLS pour chaque rôle ou la présence de l’instance exacte du schéma. L’accès administrateur Supabase n’est pas disponible ici. Ne lancez pas les migrations sur la base connectée sans d’abord vérifier son historique et l’état réel de ses tables/politiques.

Cette mission a modifié uniquement les fichiers du dépôt local : aucune variable d’environnement réelle, donnée, migration en base, publication GitHub ou version Vercel n’a été changée. Les pages Conditions et Confidentialité restent des brouillons à compléter par l’exploitant (identité officielle, coordonnées, durées, droits et règles applicables) avant une ouverture publique définitive.

## SasPay et abonnements

Le fournisseur demandé est **SasPay** (et non SasaPay). La documentation officielle et l’endpoint public des pays déclarent actuellement `BF` actif avec devise par défaut `XOF`. Cela ne confirme pas le KYC, les réseaux activés ni le scope `PAYIN` du compte marchand FasoFlow. Aucun compte marchand, secret, paiement sandbox ni webhook configuré n’a été testé. Sources : [documentation SasPay](https://docs.saspay.me/api-reference/introduction), [checkout](https://docs.saspay.me/api-reference/payments/checkout-create), [statut](https://docs.saspay.me/api-reference/payments/checkout-status), [transactions](https://docs.saspay.me/api-reference/transactions), [webhooks et signature](https://docs.saspay.me/api-reference/webhooks), [OpenAPI](https://docs.saspay.me/api-reference/openapi.json), [pays actifs](https://api.saspay.me/api/v1/countries/).

Le checkout serveur utilise `POST /api/payments/create`; le prix et le rôle sont relus depuis Supabase. La réservation FasoFlow empêche les tentatives concurrentes côté application. L’API SasPay ne prend pas en charge `Idempotency-Key` sur la création de checkout, donc une issue incertaine bloque le nouvel essai et demande une vérification, plutôt que de créer potentiellement un second checkout.

`POST /api/payments/verify` vérifie le statut auprès de SasPay. Une redirection, une capture d’écran ou une création de session ne prouvent pas le paiement. Le webhook `/api/payments/webhook` vérifie le corps HTTP brut avec les en-têtes `X-Webhook-Signature`, `X-Webhook-Timestamp` et `X-Webhook-Event`, l’HMAC SHA-256 officiel `timestamp + "." + rawBody`, la fenêtre de 300 secondes et l’égalité du type d’événement. Il rapproche ensuite l’identifiant de transaction reçu par une requête serveur SasPay, vérifie le statut `SUCCESS`, le flux entrant, XOF, le montant demandé contre la réservation FasoFlow et le statut de session lorsqu’il est disponible. Les événements sont dédupliqués. Le secret `signing_secret` est séparé de la clé API, visible une seule fois à sa création/rotation dans le dashboard, et n’est pas configuré ici. Sans `SASPAY_WEBHOOK_SIGNING_SECRET` ou `SASPAY_API_KEY`, le webhook reste fermé et répond 503.

Les clients restent gratuits ; les offres payantes concernent seulement les commerçants et les livreurs. Il n’y a ni commission sur les ventes/livraisons ni renouvellement automatique. Le paiement manuel reste `pending` jusqu’à décision administrateur ; aucune coordonnée de paiement n’est inventée.

## FasoFlow Business

Accessible au rôle commerçant avec un abonnement Business actif sous `/merchant/business`. Le panneau utilise les commandes, lignes de commande, produits, paiements, mouvements de stock et dépenses de la boutique authentifiée. Il sépare montant commandé, commandes livrées non réglées et encaissements `payment_status=paid`. Les bénéfices sont des estimations, limités aux coûts connus, et l’interface indique quand une partie des coûts manque. Les périodes journalière, hebdomadaire et mensuelle, les tendances, dépenses, clients agrégés, produits les plus vendus et alertes de stock faible utilisent les données disponibles ; aucune vente ou marge fictive n’est générée.

La migration locale `013_business_operations.sql` ajoute les tables privées `product_costs` et `order_item_costs`, le journal de stock et les dépenses avec règles d’accès. Les coûts ne sont jamais ajoutés à `products` ou `order_items`, qui peuvent être accessibles au client ; les règles RLS exigent la boutique propriétaire et un plan commerçant Business actif (ou un administrateur autorisé). Les anciens coûts demeurent inconnus ; aucune valeur n’est reconstituée. Sans migration 013, les commandes et produits existants restent lisibles, mais le coût, les dépenses et l’historique Business sont limités ; l’interface l’indique.

## FasoFlow Intelligence

Accessible au rôle commerçant avec un abonnement Business actif sous `/merchant/intelligence`. Les tâches préparées couvrent les descriptions, l’amélioration d’annonces, la suggestion de prix, l’analyse des ventes/stocks, les recommandations, alertes et résumés journaliers/hebdomadaires. L’interface fournisseur est indépendante ; l’API serveur authentifie le rôle, l’entitlement et la propriété de la boutique, limite les lignes et n’envoie pas de coordonnées ou d’identifiants de clients. Le fournisseur n’est pas configuré : aucun résultat IA n’est simulé.

FasoFlow Intelligence est incluse dans l’offre Business existante et l’écran comme l’API vérifient un abonnement commerçant Business actif. Sa configuration future est facultative et server-only : `FASOFLOW_AI_PROVIDER=openai-compatible`, `FASOFLOW_AI_API_KEY`, `FASOFLOW_AI_MODEL` et `FASOFLOW_AI_BASE_URL` HTTPS. Les noms sont documentés en commentaire dans `.env.example`; aucune variable réelle n’a été modifiée. L’administrateur du déploiement doit choisir un fournisseur, un modèle et une base URL autorisée puis ajouter les valeurs uniquement aux secrets serveur Vercel.

## Contact anti-spam

Le formulaire public transmet désormais ses données à `/api/contact` au lieu d’effectuer une insertion Supabase directe depuis le navigateur. Le serveur valide les champs, traite un honeypot et applique une limite persistante par empreintes HMAC d’adresse réseau/e-mail. La migration additive `014_contact_rate_limit.sql` retire l’insertion anonyme directe et crée la fonction SQL accessible seulement à `service_role`. Cette protection complète devient opérationnelle après application autorisée de la migration 014 et configuration serveur Supabase. Elle n’a pas été appelée en production pendant cette mission.

## Installation locale

Prérequis : Node.js 20+ et la version pnpm verrouillée dans `package.json`.

```bash
cp .env.example .env.local
pnpm install
pnpm dev
```

`pnpm dev` écoute `0.0.0.0:3000`. Configurer les clés publiques `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` uniquement dans l’environnement local approuvé. Les fonctions serveur utilisent `SUPABASE_URL`, `SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY`; les secrets ne doivent jamais porter le préfixe `VITE_` ni apparaître dans `dist/`. Aucun fichier `.env.local` n’est versionné.

## Supabase et migrations

Consulter [`supabase/README_MIGRATIONS.md`](supabase/README_MIGRATIONS.md) avant tout SQL. Les migrations `001`–`012` constituent le schéma historique ; `013` étend Business et `014` protège le formulaire Contact. L’existence de tables déjà joignables par PostgREST ne prouve pas que chaque version du schéma ou chaque migration correspond au dépôt. Vérifier d’abord le projet, l’historique et les objets présents ; appliquer seulement les migrations manquantes, compatibles et expressément autorisées, une à la fois. Il n’est pas nécessaire de disposer de `SUPABASE_DB_URL` pour utiliser le SQL Editor, mais cette méthode ne rend pas sûre une exécution aveugle.

La migration 013 suppose le schéma et les fonctions présents après la base 001–012. La migration 014 suppose `contact_messages` et la politique nommée définie dans 002 ; elle révoque l’insertion publique sans supprimer les messages existants. Les deux nouveaux fichiers sont uniquement locaux dans cette mission et n’ont pas été exécutés en base.

## Tests et contrôles locaux

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Les tests Business et SasPay utilisent des fonctions pures et n’appellent pas les services externes. Ne soumettez pas le formulaire Contact dans un environnement local connecté à la base de production. Aucun scénario réel SasPay, contrôle complet RLS multi-rôle ou migration n’a été exécuté dans cette mission.

## Mise en service future — intervention/autorisation requise

1. Dans Supabase, vérifier la référence du projet, l’état exact du schéma, les migrations exécutées et les politiques avant tout SQL ; prendre une sauvegarde vérifiée. Pour `013` et `014`, obtenir une autorisation distincte et appliquer selon le guide.
2. Dans SasPay, finaliser le KYC, confirmer sur le compte marchand le scope `PAYIN` et les réseaux XOF activés (le répertoire public liste BF actif/XOF, ce qui ne suffit pas à prouver l’activation marchand), créer une clé test serveur, puis créer un webhook `transaction.success` et copier immédiatement son `signing_secret` dans le secret Vercel `SASPAY_WEBHOOK_SIGNING_SECRET`. Ne jamais utiliser la clé API comme secret de signature. Tester signatures valides/invalide, statuts et rapprochement avec un checkout de test.
3. Si l’IA est souhaitée, sélectionner et autoriser le fournisseur, modèle et endpoint HTTPS, puis ajouter les valeurs facultatives au seul environnement serveur. Sans cela, l’écran reste désactivé sans résultat inventé.
4. Vérifier les secrets Vercel existants sans les exposer, confirmer les protections RLS et le formulaire après migrations, vérifier le rendu PWA/mobile et les parcours authentifiés.
5. Cette version locale n’a pas été poussée sur GitHub ni déployée sur Vercel. Demander séparément l’autorisation avant toute action susceptible de déclencher une publication ou de modifier l’environnement de production.

## Répertoires

- `src/app/`, `src/pages/`, `src/components/` : routeur, auth, pages publiques et espaces métier.
- `src/features/business/`, `src/features/intelligence/` : calculs, données, contrats et interface de gestion/IA.
- `src/features/`, `src/lib/`, `src/types/`, `src/styles/` : marketplace, abonnements, Supabase navigateur, utilitaires, types et styles.
- `api/payments/`, `api/intelligence/`, `api/contact.ts`, `api/_lib/` : fonctions serverless Vercel et accès server-only.
- `supabase/migrations/` : migrations SQL historiques 001–012 et additions locales 013–014.
- `public/` : identité officielle, routes, manifeste PWA et ressources publiques.
