# Appliquer les migrations FasoFlow depuis le SQL Editor

## État de connexion

L’URL Supabase et les clés d’application du projet ont passé un diagnostic limité en lecture seule : Auth répond, mais le schéma FasoFlow n’est pas encore exposé (`plans` n’existe pas dans PostgREST). Aucune migration ni écriture n’a été exécutée. Aucun connecteur d’administration Supabase n’est actif dans cet environnement. Le propriétaire a confirmé que la cible est un projet neuf/de test.

Cette méthode ne nécessite **pas** de `SUPABASE_DB_URL` et ne demande pas de recréer le projet. Ne collez aucune clé dans SQL Editor ou dans le dépôt.

## Procédure

1. Ouvrir le tableau de bord Supabase et vérifier que la référence du projet correspond au domaine indiqué par `VITE_SUPABASE_URL`. Confirmer qu’il s’agit bien du projet FasoFlow neuf/de test, pas d’une base de production.
2. Dans Supabase, ouvrir **SQL Editor**, choisir **New query** et vérifier que l’éditeur est sur le bon projet.
3. Ouvrir chaque fichier `supabase/migrations/NNN_*.sql` du dépôt, copier son contenu complet dans une nouvelle requête SQL, puis l’exécuter. Appliquer chaque fichier une seule fois, strictement dans cet ordre :
   1. `001_initial_schema.sql` — tables, relations, index et fonctions d’horodatage.
   2. `002_security_and_functions.sql` — RLS, RPC transactionnelles, Storage et Realtime. Un bucket `product-images` déjà présent conserve ses paramètres ; la politique de lecture publique n’est créée que si son champ `public` vaut déjà `true`.
   3. `003_seed_plans_categories.sql` — six plans et quatre catégories ; les conflits existants sont ignorés, pas écrasés.
   4. `004_security_workflows.sql` — contrôles de boutique/produit, fonctions admin et limites du catalogue.
   5. `005_courier_order_access.sql` — lecture limitée des commandes et accès conditionnel du livreur.
   6. `006_rls_cycle_guards.sql` — fonctions de vérification et politiques anti-récursion.
   7. `007_order_delivery_state_machine.sql` — transitions de commande/livraison et notifications.
   8. `008_profile_and_shop_guards.sql` — verrouillage des champs sensibles et contrainte de boutique.
   9. `009_manual_payment_pending_status.sql` — compatibilité de statut et paiements manuels en attente.
   10. `010_payment_reconciliation_and_order_guards.sql` — confirmation SasPay par serveur, unicité des lignes et réconciliation admin.
   11. `011_subscription_entitlements.sql` — unicité d’un paiement ouvert et d’un abonnement actif, préférences de zone et plafond de produits.
   12. `012_serialized_payments.sql` — réservation checkout SasPay atomique ; ordre cohérent des verrous pour confirmations, paiements manuels et réconciliations.
4. Attendre le résultat de chaque fichier avant d’exécuter le suivant. Si une requête échoue, arrêter la séquence, garder le nom du fichier et le texte complet de l’erreur, puis faire examiner l’état obtenu. Ne pas relancer les fichiers précédents aveuglément. La migration 011 s’arrête si elle trouve déjà plusieurs paiements ouverts ou abonnements actifs pour un compte ; elle ne supprime ni ne fusionne aucune ligne. La migration 012 doit réussir avant que l’API de création SasPay soit activée.
5. Après succès, exécuter ces vérifications limitées au catalogue et aux métadonnées de schéma ; elles ne lisent aucun profil, paiement ou contenu privé :

```sql
select audience, code, price_xof, interval, product_limit
from public.plans
order by audience, price_xof, code;

select slug, name, is_active
from public.categories
order by sort_order, name;

select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('profiles','shops','products','orders','order_items','deliveries','conversations','messages','plans','subscriptions','payments','notifications','reports')
order by tablename;

select column_name
from information_schema.columns
where table_schema='public' and table_name='profiles' and column_name='preferred_delivery_zone';
```

Le SQL Editor n’enregistre pas nécessairement ces versions dans l’historique local de Supabase CLI. Conserver les noms des migrations appliquées et ne pas utiliser ultérieurement `supabase db push` sans réconcilier cet historique.

## Contrôle de non-destruction

Les douze scripts ne contiennent pas de `DROP TABLE`, `DROP SCHEMA` ni `TRUNCATE`, et aucun n’exécute de suppression de ligne pendant son application. Des politiques, déclencheurs, contraintes et fonctions sont remplacés de façon ciblée pour actualiser la sécurité ; ces opérations ne suppriment pas les tables ni leurs lignes.

- La migration 002 crée le bucket d’images s’il manque et ignore un conflit au lieu de rendre public ou de reconfigurer un bucket préexistant ; si le bucket préexistant est privé, aucune politique de lecture publique n’est installée et les images ne seront pas servies publiquement tant que le propriétaire ne le configure pas.
- La migration 003 utilise `ON CONFLICT DO NOTHING` pour préserver tout plan ou catégorie déjà personnalisé(e).
- La migration 009 convertit seulement d’éventuels paiements manuels `pending_manual` en `pending`, puis remplace une contrainte de statuts ; elle ne supprime aucune ligne.
- La migration 010 vérifie les lignes de commande dupliquées et s’arrête en cas d’anomalie au lieu de supprimer ou fusionner des enregistrements.
- La migration 011 vérifie les paiements ouverts et abonnements actifs en double, s’arrête en cas de conflit, puis crée des index uniques. Elle ne nettoie automatiquement aucun plan, paiement ou abonnement.
- La migration 012 ne fait que créer ou remplacer des fonctions et leurs droits d’exécution ; elle ne supprime aucune ligne. Les RPC refusent les conflits et n’annulent pas ou ne fusionnent pas de transactions.
- Deux migrations définissent `DELETE FROM conversation_participants` **dans une fonction appelée ultérieurement par l’application** : lorsqu’un livreur annule une course acceptée, le livreur est retiré du chat de livraison pour qu’il n’y ait plus accès. Cette instruction n’est pas exécutée pendant l’application du SQL. Des clés étrangères prévoient aussi certains `ON DELETE CASCADE`, déclenchés seulement par une future suppression autorisée de l’enregistrement parent ; aucune cascade ne se déclenche à l’installation.

## Après les migrations

- Dans **Authentication → URL Configuration**, renseigner l’URL de site effective et autoriser `/account/confirm`, `/reset-password` et `/login`.
- Créer un compte FasoFlow normal et vérifier l’inscription, la connexion, le profil et le stockage. Aucun compte administrateur n’est créé automatiquement ; l’inscription publique ne peut pas s’attribuer ce rôle.
- Si le propriétaire veut activer l’administration, créer d’abord son compte Auth, vérifier son UUID exact dans **Authentication → Users**, puis seulement exécuter cette commande ciblée dans SQL Editor :

```sql
update public.profiles
set role = 'admin'
where id = 'UUID_AUTH_VERIFIE';
```

Remplacer `UUID_AUTH_VERIFIE` uniquement par l’UUID dont la correspondance a été vérifiée.

- La migration 002 crée le bucket d’images et ses politiques s’il n’existe pas. Sur un bucket préexistant, comparer manuellement sa visibilité et ses règles avant d’y stocker des photos. Un bucket préexistant privé reste privé : ses images ne seront pas visibles au public avant une décision et configuration explicites du propriétaire.
- Les variables Supabase d’application sont gérées dans l’environnement sécurisé du projet. Après la création du schéma, recharger Preview et tester les rôles. La clé `SUPABASE_SERVICE_ROLE_KEY` ne doit jamais porter le préfixe `VITE_` ni apparaître dans un bundle navigateur.
- SasPay est indépendant de ces migrations : il faudra une clé marchande de test `payin` autorisant BF/XOF pour tester le checkout. Aucun paiement réel n’a été lancé ; le webhook reste désactivé tant que son contrat exact de signature n’est pas confirmé.
