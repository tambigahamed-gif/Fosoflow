# Plan de réalisation — FasoFlow

## Objectif et périmètre

Faire évoluer l’application existante `fasoflow/` — sans la reconstruire — en une plateforme commerciale FasoFlow réunissant marketplace, gestion professionnelle FasoFlow Business et assistant FasoFlow Intelligence. Le marché actif reste le Burkina Faso et les montants restent en XOF/FCFA. La configuration de marché est centralisée pour préparer une extension ultérieure sans activer de pays ou de devise non validés. Les rôles demeurent client, commerçant, livreur et administrateur protégé. Le travail autorisé porte sur les fichiers du projet et les migrations SQL préparées localement. Il ne comprend ni modification de variable/environnement, ni écriture ou migration en production, ni déploiement.

## Architecture et implémentation

- **Web client :** conserver React, TypeScript strict, Vite, Tailwind CSS et React Router. Réutiliser les composants, providers, pages, services et tableaux de bord existants ; créer des modules par domaine plutôt qu’un composant monolithique. Garder les écrans en français, les prix en XOF issus du registre `src/lib/market.ts` et une expérience adaptée aux téléphones.
- **Données et identité :** conserver Supabase Auth, PostgreSQL, Storage et Realtime. Le navigateur utilise seulement la clé publique. RLS demeure obligatoire pour les données tenantées. Les fonctions serveur contrôlent l’identité et le rôle ; aucune inscription ne peut s’attribuer `admin`.
- **Marketplace :** maintenir les statuts de publication et la modération existants. La page publique doit distinguer une liste vide d’une erreur de requête, proposer les filtres réellement disponibles et ne jamais ajouter d’annonces fictives. L’audit en lecture seule a trouvé zéro produit public et zéro boutique visible ; ce constat ne justifie aucune écriture ou graine de données en production.
- **FasoFlow Business :** ajouter un espace commerçant disponible seulement avec un abonnement Business commerçant actif. Il calcule ses métriques à partir des commandes, lignes de commande, paiements confirmés, produits, mouvements de stock et dépenses réellement enregistrés. Séparer clairement le volume commandé des encaissements confirmés. Présenter le bénéfice comme une estimation, et le signaler incomplet lorsqu’il manque un coût d’achat ou une autre donnée nécessaire. Afficher des périodes journalières, hebdomadaires et mensuelles, des alertes de seuil de stock et des rapports graphiques accessibles.
- **Persistance Business :** préparer une migration additive qui conserve tables, lignes et historiques : coût de revient facultatif dans `product_costs`, snapshot des coûts dans `order_item_costs`, mouvements de stock historisés et dépenses commerçant. Les coûts ne sont jamais ajoutés aux tables publiques `products` ou `order_items`. Un trigger journalise les changements de stock ; la fonction de commande existante est étendue dans la migration pour relier une sortie de stock à sa commande. Les RLS vérifient à la fois l’appartenance à la boutique et l’abonnement Business commerçant actif ; l’administrateur autorisé conserve son accès.
- **FasoFlow Intelligence :** inclure l’assistant dans l’offre Business existante, sans modifier les prix ni les limites, et vérifier un abonnement Business commerçant actif côté écran et API. Définir une interface de fournisseur indépendante, une API Vercel server-only et une interface commerçant pour les descriptions, améliorations d’annonces, suggestions de prix, analyses des ventes/stocks, recommandations, alertes et résumés. Les contrôles serveur limitent strictement chaque requête aux données du commerçant authentifié ; aucun contact ou donnée personnelle de client n’est envoyé au modèle. Sans clé fournisseur configurée, le service demeure désactivé avec une explication visible : aucune réponse fictive ne sera montrée.
- **Contact et opérations serveur :** remplacer l’écriture publique directe du formulaire de contact par une fonction serveur avec validation, champ honeypot et limitation de débit persistante via une empreinte de réseau pseudonymisée. Préparer une migration pour cette limitation, sans supprimer de message existant. Les fonctions Vercel continuent d’utiliser les helpers d’authentification et les clés Supabase serveur déjà présentes ; aucune valeur secrète n’est demandée ni modifiée.
- **SasPay :** conserver la création de checkout côté serveur, la confirmation pull par statut fournisseur, l’idempotence interne et le contrôle des doublons existants. Ne valider aucun paiement depuis une redirection seule. Implémenter la sécurité webhook à partir du contrat officiel ci-dessous. Si le nouveau secret de signature n’est pas disponible côté serveur, le webhook reste fermé et l’API de vérification de statut reste la voie de secours.
- **PWA et identité :** conserver le manifeste, les icônes et le logo officiel fourni. Le service worker ne met pas en cache les réponses privées, les paiements ou les commandes.
- **Git et hébergement :** préserver les dépôts GitHub et Vercel ; travailler dans `/home/ubuntu/fasoflow`. Aucune poussée susceptible de déclencher Vercel, aucune publication, aucune modification de config ou de secrets n’est comprise dans cette autorisation.

## Structure de modules

- `public/` : logo, favicon, icônes PWA, manifeste, routes et ressources publiques.
- `src/app/` : providers, auth, routeur et composition de l’application.
- `src/components/` : composants réutilisables UI, layout, navigation, formulaires, boutique, produits, chat et abonnements.
- `src/pages/` : pages publiques, authentification, client, commerçant, livreur, admin et informations légales.
- `src/features/` : modules métier existants et nouveaux domaines `business/` et `intelligence/`, avec leurs types, calculs, états et clients API.
- `src/lib/`, `src/types/`, `src/styles/` : Supabase public, configuration de marché BF, validations, utilitaires, types et styles.
- `api/` : handlers Vercel server-only ; conserver `api/payments/` et `api/_lib/`, ajouter les routes intelligence et contact.
- `supabase/migrations/` : conserver les migrations existantes 001–012 ; créer uniquement des migrations additives séquencées pour les nouvelles tables, colonnes, fonctions et politiques. Elles seront documentées, mais ne seront pas exécutées sur Supabase en production.
- `tests/` : conserver Vitest ; ajouter des tests unitaires des calculs Business, de l’isolation des données IA et de la signature SasPay sans appeler un compte marchand réel.

## Identité visuelle

**Mouvement :** artisanat contemporain et design éditorial numérique — chaleureux et local, sans folklore décoratif ni surcharge.

**Principes :** (1) confiance visible dans le prix, le vendeur et le statut ; (2) parcours d’achat et de gestion compréhensibles au premier regard ; (3) expression locale sobre et non stéréotypée ; (4) lisibilité, accessibilité et priorité au mobile.

**Philosophie des couleurs :** fond ivoire chaud pour la proximité et le confort ; vert profond comme couleur propriétaire évoquant stabilité et croissance ; terre cuite et safran en accents rappelant l’énergie de marché et les couleurs burkinabè sans reproduire le drapeau à chaque écran ; gris encre pour le texte. Les accents restent réservés aux actions, prix et statuts importants.

**Mise en page :** accueil éditorial avec recherche et découverte ; catalogue avec filtres utilisables au pouce ; fiches centrées sur la confiance ; navigation compacte sur mobile ; espace Business structuré autour d’une période, d’indicateurs chiffrés et de tableaux détaillés, sans faire passer une estimation pour une donnée comptable confirmée.

**Éléments signature :** symbole officiel FasoFlow, cadres fins inspirés du tissage et pastilles d’état compactes avec prix XOF bien contrastés.

**Interactions et animation :** retours immédiats et explicites, erreurs proches du champ, confirmations après écriture, états de chargement et pages vides utiles. Transitions discrètes de 150–220 ms, respect de `prefers-reduced-motion`. Un paiement n’est jamais présenté comme réussi avant validation serveur.

**Typographie :** titres en Manrope et textes/UI en DM Sans, avec fallbacks système ; corps lisible sur téléphone et chiffres tabulaires pour prix/statistiques.

**Essence :** « Le marché numérique qui rapproche les bonnes boutiques, les clients et les livreurs au Burkina Faso. » Personnalité : fiable, accessible, vivante.

**Voix :** directe, respectueuse et concrète. Exemples : « Les trouvailles du quartier, réunies au même endroit. » et « Votre boutique est prête à prendre sa place. »

**Logo :** utiliser le logo officiel FasoFlow fourni par l’utilisateur, avec le symbole et le wordmark accompagnés de « Achète. Vends. Ça circule. ». Garder les proportions des recadrages, les icônes dérivées du symbole et la composition accessible ; ne pas substituer l’identité par un dessin générique.

**Couleur propriétaire :** vert FasoFlow profond `#155B46`, accompagné d’ivoire `#F8F5EC`, terre cuite `#C9503B`, safran `#E0AE3C` et encre `#202721`.

## SasPay — contrat officiel vérifié

Le fournisseur demandé est **SasPay**, orthographié ainsi. La documentation officielle décrit l’API marchande à `https://api.saspay.me/api/v1/`, avec `Authorization: Bearer sk_test_…` en test ou `sk_live_…` en production. Le répertoire public officiel de pays retourne actuellement `BF` Burkina Faso, actif, devise `XOF` ; cela confirme l’éligibilité géographique du checkout, mais pas le KYC, le scope PAYIN ni les réseaux activés sur le compte marchand. La création utilise `POST /checkout-sessions/` ; la page checkout renvoie une URL hébergée et l’état initial `PENDING`. La vérification utilise `GET /checkout-sessions/{id}/status/`. L’activation FasoFlow exige une session correspondante et le statut `PAID` avec `transaction_status` `SUCCESS`. Le statut de session ne donnant pas de montant/devise fiables, le montant XOF est comparé à la réservation interne du plan et au détail de transaction SasPay. Sources : [introduction API](https://docs.saspay.me/api-reference/introduction), [création checkout](https://docs.saspay.me/api-reference/payments/checkout-create), [statut checkout](https://docs.saspay.me/api-reference/payments/checkout-status), [pays actifs SasPay](https://api.saspay.me/api/v1/countries/).

Le guide officiel précise les trois headers `X-Webhook-Signature` (64 caractères hexadécimaux minuscules), `X-Webhook-Timestamp` (horodatage Unix en secondes) et `X-Webhook-Event`. Le secret `signing_secret` n’est délivré qu’une fois à la création/rotation dans le dashboard marchand. La signature est `hex(HMAC_SHA256(signing_secret, timestamp + "." + rawBody))` sur les octets bruts reçus. Rejeter un timestamp distant de plus de 300 secondes, comparer en temps constant et vérifier que l’en-tête d’événement correspond au `event` JSON. Le webhook d’exemple ne contient pas d’identifiant de checkout session ; le checkout accepte un champ `metadata`, mais la propagation de celui-ci dans le webhook n’est pas documentée. Pour éviter une corrélation supposée, FasoFlow inscrit un marqueur unique `FFPAYMENT:<UUID>` dans la description serveur du checkout, puis lit `GET /transactions/{id}/` depuis SasPay et compare statut `SUCCESS`, flux `INBOUND`, devise, montant demandé et marqueur au paiement enregistré. Si l’identifiant de session local est présent, son statut est également vérifié ; seule une correspondance exacte peut activer. Les événements sont enregistrés/dédupliqués dans `payment_events`. Sans secret de signature ou clé API serveur, la fonction retourne 503 et ne touche aucune activation. Sources : [webhooks SasPay](https://docs.saspay.me/api-reference/webhooks), [transactions](https://docs.saspay.me/api-reference/transactions), [spécification OpenAPI](https://docs.saspay.me/api-reference/openapi.json).

La création de checkout ne prend pas en charge `Idempotency-Key`, même si l’introduction la décrit comme optionnelle de façon générale. FasoFlow garde ses verrous/réservations internes, réutilise une session connue et bloque toute issue incertaine plutôt que de renvoyer aveuglément une création. `return_url` est facultatif et documenté par l’OpenAPI ; FasoFlow ne l’ajoute pas sans origine publique fiable, et la vérification reste accessible dans l’espace abonnement. Créer/abonner les webhooks se fait dans le dashboard SasPay, pas par API. Aucun compte marchand, secret ni paiement sandbox réel n’a été testé.

## État externe et limites de l’intervention

L’audit public a observé des endpoints Supabase reconnus, des réponses de refus anonymes `401`/`42501` pour plusieurs données sensibles, ainsi que zéro produit public et zéro boutique visible. Cela n’établit ni la version exacte du schéma, ni l’historique des migrations, ni la correction complète des RLS par rôle. Le connecteur d’administration Supabase n’est pas accessible ; l’historique et les politiques doivent être vérifiés par le propriétaire avant toute migration. Le README historique disant que le schéma était absent contredit l’état du PostgREST observé et doit être réconcilié.

Les modifications demeurent locales. Les secrets SasPay et IA, leur présence dans Vercel, les opérations RLS par rôle et les transactions réelles ne peuvent pas être confirmés sans les accès correspondants. Aucun changement de variables, aucune écriture Supabase, aucune application de migration et aucun déploiement ne seront effectués dans cette mission.
