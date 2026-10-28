# FasoFlow

Marketplace SaaS en français destinée au Burkina Faso : clients, commerçants et livreurs ; montants affichés en XOF/FCFA. Stack : React 18, TypeScript strict, Vite, Tailwind, Supabase Auth/PostgreSQL/Storage/Realtime et fonctions serveur Vercel.

## État et limites importantes

Les clés du projet Supabase ont été configurées et vérifiées par des requêtes de diagnostic en lecture seule : Auth répond, mais le schéma FasoFlow n’est pas encore visible et aucune migration ni écriture n’a été exécutée. Aucun connecteur d’administration Supabase n’est actif ; l’application de schéma doit donc se faire par le SQL Editor, sans `SUPABASE_DB_URL` (voir [`supabase/README_MIGRATIONS.md`](supabase/README_MIGRATIONS.md)). Aucun compte marchand SasPay ni déploiement Vercel n’est connecté. Les annonces de démonstration sont étiquetées et ne peuvent pas être achetées ; aucune donnée ou paiement fictif n’est présenté comme réel. Les CGU/confidentialité demeurent à compléter par l’exploitant (raison sociale, coordonnées, conservation et droits).

L’intégration du prestataire est **SasPay** (saspay.me), pas SasaPay. L’API checkout et son statut serveur sont implémentés dans `/api/payments`. Une session de paiement ne suffit pas à valider un règlement : l’activation se fait seulement si l’API officielle confirme `PAID` et `SUCCESS`. Les docs indiquent actuellement que le retour `return_url` n’est pas pris en charge : la session est conservée sur l’appareil et l’utilisateur peut revenir dans son espace abonnement pour appuyer sur « Vérifier un paiement SasPay en cours ». Une clé marchande de test avec scope `payin` est nécessaire pour tester réellement.

L’exemple officiel de réponse du endpoint de statut expose l’identifiant de session, `status`, `transaction_status` et les identifiants/références de transaction, mais pas le montant ni la devise [documentation du statut SasPay](https://docs.saspay.me/api-reference/payments/checkout-status). FasoFlow lie donc la confirmation automatisée à l’identifiant UUID de la session créé pour le montant XOF enregistré côté serveur. Si la création renvoie un résultat réseau incomplet ou incertain, l’application bloque toute nouvelle tentative et exige qu’un administrateur vérifie la transaction dans le compte marchand SasPay, saisisse la référence et consigne une note d’audit avant l’activation.

**Les webhooks sont volontairement désactivés.** Le guide officiel exige un timestamp à moins de cinq minutes et une comparaison HMAC du corps brut en temps constant, mais les informations récupérées ne précisent pas les trois noms d’en-têtes complets, l’algorithme, la chaîne signée ni le nom du secret marchand. `/api/payments/webhook` répond 503 et ne modifie aucun paiement. Ne pas activer des webhooks en production avant confirmation écrite de SasPay des paramètres exacts puis un test de signature valide et invalide.

Le paiement manuel reste en attente jusqu’à décision admin. Les instructions sont vides au départ et doivent être configurées dans la zone d’administration ; aucune coordonnée bancaire ou mobile n’est fournie par défaut. Les clients ne paient pas d’abonnement. Les abonnements payants ne prélèvent pas de commission sur les ventes ou livraisons.

## Prérequis

- Node.js 20+ et pnpm 11 (version verrouillée dans `package.json`).
- Projet Supabase (Auth e-mail activé, PostgreSQL et Storage).
- Pour l’API, un déploiement Vercel et `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` côté serveur uniquement.
- Pour le checkout réel, clé API marchand SasPay avec scope payin et pays/devise autorisés par le compte (ici `BF` / `XOF`).

## Installation locale

```bash
cp .env.example .env.local
pnpm install
pnpm dev
```

Configurer au minimum `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` dans `.env.local`. `pnpm dev` écoute `0.0.0.0:3000`. Les clés server-only ne doivent jamais être préfixées `VITE_`. `.env.local` est ignoré par Git.

## Supabase et migrations

1. Vérifier que le projet ouvert dans Supabase correspond à `VITE_SUPABASE_URL` ; le propriétaire a confirmé qu’il s’agit d’un projet neuf/de test.
2. Ouvrir **SQL Editor → New query**, puis appliquer une migration à la fois, de `001_initial_schema.sql` à `012_serialized_payments.sql`, dans l’ordre décrit dans [`supabase/README_MIGRATIONS.md`](supabase/README_MIGRATIONS.md). L’API de checkout SasPay requiert la migration 012. Une URL SQL de type `SUPABASE_DB_URL` n’est pas nécessaire pour cette méthode.
3. Si une requête échoue, arrêter la séquence, conserver le message d’erreur et ne pas lancer les fichiers suivants avant d’avoir compris l’état obtenu. Le guide détaille les clauses de sécurité et les requêtes de vérification.
4. Les migrations créent le profil Auth avec un rôle public limité à `client`, `merchant` ou `courier`. L’inscription navigateur ne peut pas devenir `admin`. Attribuer le premier administrateur seulement par le propriétaire du projet après vérification de l’identifiant `auth.users.id`.
5. Auth e-mail : configurez l’URL de site et les URL de redirection (`/account/confirm`, `/reset-password`, `/login`) dans Supabase Auth. Le compte nécessite la confirmation e-mail si activée. Google OAuth reste désactivé tant que ses identifiants ne sont pas configurés.
6. Les migrations initialisent les plans et catégories sans créer de compte marchand ni annonce de démonstration. Les photos produit passent par le bucket `product-images` avec un préfixe UUID utilisateur ; un bucket privé préexistant reste privé et n’obtient pas de politique de lecture publique. Les vérifications d’accès RLS et des rôles restent à effectuer après application.

## Paiements SasPay

1. Créer/valider le compte marchand et les clés depuis le tableau de bord SasPay, puis confirmer que la clé possède le scope `payin` et autorise Burkina Faso (`BF`) et XOF.
2. Ajouter à l’environnement serveur Vercel `SASPAY_API_KEY` (jamais `VITE_`, jamais Git).
3. Endpoint de création : `POST /api/payments/create`, Bearer d’une session Supabase, `{ "planId": "merchant-premium" }` ou un plan livreur. Le backend reprend le rôle/prix depuis PostgreSQL et réserve atomiquement une seule tentative par profil via la RPC de migration 012 avant de créer une session ; il renvoie uniquement une URL `https://pay.saspay.me`.
4. Vérification : `POST /api/payments/verify` avec Bearer du même utilisateur et `{ "sessionId": "…" }`. Seule réponse serveur SasPay `PAID` + `SUCCESS` active un mois d’abonnement. Une redirection, une URL ou une capture d’écran ne prouvent rien.
5. `/api/payments/webhook` reste fermé tant que SasPay n’a pas confirmé par écrit les headers exacts et la formule de signature. Ne pas ajouter une URL de webhook avant activation du validateur.

## Paiement manuel de secours

Un administrateur configure les instructions exactes via l’écran Admin > Paiements ; l’utilisateur soumet ensuite une référence. L’état reste `pending` (avec `provider=manual`). Un admin examine et accepte/rejette depuis le tableau de bord ; la validation enregistre `reviewed_by` et `reviewed_at`. Les instructions ne doivent pas contenir d’informations non vérifiées.

## Commandes, livraisons et rôles

`place_order` verrouille les articles/stock et écrit une commande et des prix snapshot dans une seule transaction. Les commandes ne sont pas des paiements : elles restent `unpaid`. `accept_delivery` est une mise à jour conditionnelle atomique ; le livreur doit activer sa disponibilité. Les statuts livraison autorisés restent `pending`, `accepted`, `in_progress`, `delivered`, `cancelled`. Les accès aux adresses clients sont accordés uniquement au livreur affecté. Aucun suivi GPS permanent n’est implémenté.

## Vérifications

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## Déploiement Vercel

1. Importer le dépôt `main` dans Vercel en reconnaissant Vite.
2. Configurer les variables navigateur `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` et les secrets server-only ci-dessus. Ne pas copier `.env.local` au dépôt.
3. Ajouter `CRON_SECRET` si le cron journalier doit expirer les abonnements dans le statut de base. Les règles d’accès premium vérifient également `current_period_end`; l’historique reste conservé.
4. Construire `pnpm build`. Les fichiers `/api/*` s’exécutent comme fonctions Vercel; `vercel.json` fournit le fallback des routes React et le cron quotidien.
5. Tester au minimum routes publiques, connexion/rôles, RLS, stockage image, commande/course concurrente, renouvellement/expiration et checkout sandbox, plus l’absence de secrets `service_role`/SasPay dans `dist/`.

## Répertoires

- `src/app`, `src/pages`, `src/components` : app, routage, écrans publics et espaces métier.
- `src/features` : authentification, commandes/panier, messagerie, abonnements et logique métier.
- `src/lib`, `src/types`, `src/styles` : client public Supabase, utilitaires, contrats TypeScript et styles.
- `api/payments`, `api/cron`, `api/_lib` : fonctions serverless Vercel et accès aux secrets.
- `supabase/migrations` : schéma, RLS, RPC transactionnelles, plans, catégories et accès livreur.
- `public/` : marque, routes, manifeste, service worker statique et visuels originaux (`images/`) intégrés au build.
