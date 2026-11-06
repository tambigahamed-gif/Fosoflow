# Migrations FasoFlow — vérification préalable obligatoire

## État constaté et limites

À la date du dernier audit en lecture seule, le site répondait, des endpoints PostgREST Supabase étaient reconnus, et les réponses anonymes sur plusieurs données sensibles étaient refusées. Les comptages HEAD de `products` et `shops` renvoyaient zéro ligne publique visible. Ces constats ne permettent pas de déterminer quelles migrations ont été exécutées, quelles versions sont appliquées, ni si les règles RLS sont correctes pour chaque rôle. Aucun accès administratif Supabase n’est disponible dans cette tâche.

Aucune migration, écriture, suppression ou modification de configuration Supabase n’a été effectuée ici. **Ne copiez pas la séquence complète dans un projet de production sans contrôle préalable.** Les migrations `013`, `014` et `015` sont préparées localement uniquement.

Cette procédure SQL Editor ne nécessite pas `SUPABASE_DB_URL` et ne demande pas de recréer le projet. Elle ne remplace pas la vérification de l’environnement, de l’historique ou des permissions.

## Vérifications avant toute exécution future

1. Confirmer dans le tableau de bord Supabase la référence du projet et sa correspondance avec `VITE_SUPABASE_URL`. Vérifier expressément s’il s’agit de production ou d’un projet de test.
2. Demander au propriétaire/administrateur de relever les migrations effectivement appliquées dans le registre de migration utilisé par le projet, et de comparer le schéma, les fonctions et les politiques avec les fichiers du dépôt. Ne pas supposer que l’absence d’un objet isolé signifie que tout le schéma est vide.
3. Si le registre est incomplet (par exemple SQL Editor utilisé hors Supabase CLI), inspecter explicitement chaque table, colonne, fonction, trigger et politique déjà présents avant de décider quoi exécuter. Ne jamais rejouer `001`–`012` en bloc sur une base déjà initialisée.
4. Vérifier l’existence d’une sauvegarde récupérable et obtenir l’autorisation du propriétaire pour chaque changement. Arrêter au premier résultat inattendu et ne pas relancer un fichier en entier sans comprendre son état.
5. Utiliser **SQL Editor → New query**, appliquer un seul fichier à la fois et conserver le résultat complet. Une migration ne doit être appliquée qu’une seule fois à un schéma qui correspond à sa précondition.

## Ordre historique et préconditions

Les fichiers 001–012 constituent la base historique de FasoFlow. Leur ordre de référence est :

1. `001_initial_schema.sql` — tables, relations, index et fonctions d’horodatage.
2. `002_security_and_functions.sql` — RLS, RPC transactionnelles, Storage, Realtime et politique de contact initiale.
3. `003_seed_plans_categories.sql` — plans et catégories ; les conflits existants sont ignorés.
4. `004_security_workflows.sql` — contrôles de boutique/produit, fonctions admin et limites du catalogue.
5. `005_courier_order_access.sql` — accès conditionnel du livreur aux commandes.
6. `006_rls_cycle_guards.sql` — protections de politiques et vérifications.
7. `007_order_delivery_state_machine.sql` — transitions de commande/livraison et notifications.
8. `008_profile_and_shop_guards.sql` — verrouillage des champs sensibles et contraintes boutique.
9. `009_manual_payment_pending_status.sql` — compatibilité des paiements manuels en attente.
10. `010_payment_reconciliation_and_order_guards.sql` — confirmation serveur et réconciliation.
11. `011_subscription_entitlements.sql` — droits d’abonnement, préférences et limites.
12. `012_serialized_payments.sql` — réservation checkout SasPay atomique et ordre des verrous.

Ne pas appliquer ces fichiers si le projet est déjà initialisé sans comparer leur contenu à l’historique. La suite 013/014 n’est compatible qu’avec les fonctions, colonnes, rôles et politiques attendus après la version de base correspondante.

## Nouvelles migrations locales (non appliquées)

13. `013_business_operations.sql` — crée les tables privées `product_costs` et `order_item_costs`, les dépenses et mouvements de stock avec RLS propriétaire + plan Business actif (admin autorisé), un trigger de journalisation et l’ajustement transactionnel des fonctions de commande. Aucun coût n’est ajouté aux tables publiques `products` ou `order_items`. Les coûts historiques restent inconnus et ne sont pas inventés.
14. `014_contact_rate_limit.sql` — retire la politique d’insertion anonyme `contact_public_insert`, révoque les droits d’insertion navigateur sur `contact_messages`, crée les empreintes de limitation de débit et la RPC limitée à `service_role`. Les messages de contact existants ne sont pas supprimés.
15. `015_marketplace_services_and_product_modes.sql` — étend les rôles d’inscription autorisés à `service_provider` sans autoriser `admin` ; ajoute catégories et profils professionnels, prestations modérées, demandes de devis, avis, RLS/RPC et bucket `service-images` ; utilise des grants limités sur les nouvelles tables, révoque les mutations directes de conversations/participants et ne conserve que la lecture/l’insertion de messages côté client. Les transitions de devis et la création de fils passent par les RPC SECURITY DEFINER. Ajoute les conditions/modes/minimums/délais des produits, catégories manquantes, snapshots dans les futures lignes de commande et validations transactionnelles de stock/minimum. Met aussi à jour la restitution du stock à l’annulation : un produit `made_to_order` n’est pas re-crédité s’il n’a pas été décrémenté. Les anciens attributs inconnus restent `NULL`.

Préconditions : 013 suppose les tables `products`, `order_items`, `shops`, `orders`, `profiles`, `deliveries`, `conversations`, `conversation_participants` et `notifications`, ainsi que les signatures de `place_order` et `merchant_update_order_status` issues de la base attendue. 014 suppose `contact_messages` et la politique `contact_public_insert` déclarée par la migration 002. 015 suppose le schéma attendu après 001–014, notamment les tables `profiles`, `products`, `order_items`, `categories`, `conversations` (contrainte `conversations_check`), `conversation_participants`, `messages`, `notifications`, les fonctions `is_admin()`/`is_conversation_participant()` et les tables Business utilisées par `place_order` 013. Vérifier que `service_provider` n’a pas déjà une autre sémantique. Si une précondition diffère, **ne pas exécuter** le fichier avant adaptation et revue.

## Vérifications après application autorisée

Exécuter seulement après succès d’une migration et dans l’environnement expressément visé. Ces requêtes vérifient des métadonnées/catalogues sans lire de profils ou de paiements privés :

```sql
select audience, code, price_xof, interval, product_limit
from public.plans
order by audience, price_xof, code;

select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'profiles','shops','products','orders','order_items','deliveries',
    'conversations','messages','plans','subscriptions','payments',
    'notifications','reports','product_costs','order_item_costs',
    'business_expenses','stock_movements','contact_rate_limits',
    'service_categories','service_provider_profiles','service_listings',
    'service_requests','service_reviews'
  )
order by tablename;

select policyname, tablename, cmd
from pg_policies
where schemaname='public'
  and tablename in ('contact_messages','product_costs','order_item_costs','business_expenses','stock_movements',
                    'service_categories','service_provider_profiles','service_listings','service_requests','service_reviews')
order by tablename, policyname;
```

Après une future installation vérifiée : tester les parcours avec comptes contrôlés de rôles distincts, confirmer qu’un commerçant Business actif ne voit/modifie que les coûts, dépenses et mouvements de sa boutique, qu’un compte Starter/Premium ne peut pas accéder aux tables Business, qu’aucun anonyme ne peut écrire dans `contact_messages`, et que le formulaire contact ne réussit que lorsque son RPC de limitation répond. Ces tests n’ont pas été réalisés sur la base connectée.

## Contrôle non-destructif des migrations

Les scripts 001–012 et les nouveaux fichiers 013–015 ne doivent pas supprimer de table ni de données existantes. Les migrations 013–015 sont additives pour les tables/lignes, mais remplacent ou retirent des règles, triggers, fonctions ou contraintes ciblés pour renforcer la sécurité et le comportement métier. La migration 014 retire explicitement l’insertion publique directe dans `contact_messages` ; l’API serveur doit être déployée/configurée avant de rouvrir le formulaire en production.

- 013 crée seulement des tables/index/politiques/triggers/fonctions ciblés ; elle ne modifie pas les colonnes publiques de produits/commandes et ne reconstitue pas les coûts des commandes anciennes. Son trigger journalise les changements de stock ultérieurs, tandis que les lectures/écritures Business sont également limitées au plan Business actif.
- 014 ne supprime aucun message de contact. La table de limitation ne stocke que des HMAC d’adresse réseau/e-mail, pas les valeurs brutes.
- 015 ne supprime aucune table, aucun produit, aucune commande, aucun message ni aucune catégorie existante. Elle ajoute des tables/colonnes/index/policies/fonctions, remplace la contrainte de rôle et la contrainte de conversation, et remplace `place_order` et `merchant_update_order_status` tout en conservant les validations Business 013, les coûts d’achat privés, les transitions, notifications et journalisation. Lors d’une annulation, le stock est restauré uniquement pour les modes qui l’avaient décrémenté ; les anciennes lignes dont le snapshot est `NULL` sont traitées comme des ventes au détail historiques. Les attributs des produits historiques restent inconnus (`NULL`) ; les catégories ajoutées utilisent `ON CONFLICT DO NOTHING`.
- Les migrations antérieures peuvent contenir des instructions `DELETE` à l’intérieur de fonctions appelées plus tard, ou des `ON DELETE CASCADE` déclenchés par une future suppression autorisée. Leur définition ne supprime pas les lignes à elle seule. Lire le guide d’origine et les dépendances SQL avant toute application.
- Les instructions `DROP POLICY`, `DROP TRIGGER` et `CREATE OR REPLACE FUNCTION` ciblées ne suppriment pas les tables ni les lignes, mais changent la sécurité et le comportement. Elles doivent être comparées au schéma réellement installé.

## Configuration restante

- Configurer les URLs d’authentification et les rôles admin selon les procédures du propriétaire ; aucune inscription publique ne peut attribuer `admin`.
- Vérifier le bucket `product-images` existant avant tout changement de visibilité.
- Les variables d’application Supabase et SasPay restent dans l’environnement serveur sécurisé ; ne jamais exposer `SUPABASE_SERVICE_ROLE_KEY` avec un préfixe `VITE_`.
- Le formulaire contact et FasoFlow Business nécessitent respectivement 014 et 013 pour toutes leurs fonctions. `product_costs`, `order_item_costs`, `business_expenses` et les lectures de `stock_movements` doivent être limités par RLS à la boutique propriétaire avec abonnement Business commerçant actif (ou admin autorisé) ; aucun coût ne doit être exposé aux clients ni aux plans Starter/Premium. Aucun fichier de migration n’a été exécuté dans cette mission.
- L’endpoint public SasPay liste `BF` actif en `XOF`; cela ne confirme pas le KYC, le scope marchand `PAYIN`, ni les réseaux réellement activés sur le compte. Confirmer ces éléments, obtenir une clé sandbox et copier le `signing_secret` lors de la création/rotation du webhook avant tout test.
- FasoFlow Intelligence demeure désactivé jusqu’à ce que l’exploitant choisisse et configure un fournisseur IA côté serveur. Les valeurs ne sont pas renseignées ici.
- Le rôle prestataire ne possède ni abonnement payant ni plan. Les services utilisent des demandes de devis et conversations ; aucun paiement, commission ou moteur de réservation complexe n’est introduit. Profils/prestations restent privés ou en attente avant modération.
