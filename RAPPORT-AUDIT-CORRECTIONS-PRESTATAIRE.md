# FasoFlow — audit local de l’espace prestataire

## Portée et état

Audit statique du dépôt public `tambigahamed-gif/Fosoflow`, branche `main`, commit de départ `0acd7d9` (8 novembre 2026). Le dépôt contient bien cinq rôles métier dans le code : `client`, `merchant`, `courier`, `service_provider` (prestataire) et `admin`. Les routes prestataire se trouvent notamment sous `/provider/*`.

Cette analyse porte sur le code cloné, pas sur une session authentifiée dans le SaaS ni sur sa base Supabase en production. Aucun compte, aucune donnée de production et aucun secret n’ont été utilisés.

## Diagnostic important

Le parcours prestataire utilise les tables, fonctions RPC et le bucket définis dans `supabase/migrations/015_marketplace_services_and_product_modes.sql`. Le dépôt et son guide indiquent que cette migration est locale/non appliquée et qu’elle doit être comparée au schéma réel avant toute exécution. Si elle manque dans la base du SaaS, l’interface seule ne peut pas rendre opérationnels le profil professionnel, le catalogue, les demandes, les devis et les conversations prestataire. La migration n’a pas été appliquée ici : aucune modification Supabase n’a été faite.

Autres limites d’intégration à vérifier dans l’environnement visé : la disponibilité de `service_provider_profiles`, `service_listings`, `service_categories`, `service_requests`, des RPC de réponse/conversation et du bucket `service-images`, ainsi que leurs règles RLS et politiques Storage. Une simple vérification d’une table à l’inscription ne garantit pas que tout le parcours est installé.

## Notifications — état du code

Le dépôt contient une table `notifications` et des fonctions métier qui en créent (notamment des changements de commande/livraison, événements d’abonnement et demandes de devis de service). La migration 002 ajoute cette table à la publication Supabase Realtime. Toutefois, la seule page de consultation utilisateur repérée est dans l’espace client ; son chargement est ponctuel, sans abonnement Realtime ni gestion visible des erreurs. Les menus commerçant, livreur et prestataire ne proposent pas cette page. Aucun mécanisme de notifications push navigateur n’a été trouvé. L’état réel de la publication Realtime et l’application des migrations dans le SaaS restent à vérifier dans le projet Supabase en ligne.

## Corrections apportées uniquement dans la copie locale

- `ProviderServicesManager.tsx` collecte désormais les erreurs de lecture du profil, des prestations et des catégories au lieu de n’afficher que la première. En cas d’échec, il efface les résultats partiels pour ne pas laisser croire que le catalogue est complètement chargé.
- Le formulaire vérifie le plafond de huit photos avant le moindre téléversement. Si un envoi ultérieur ou l’enregistrement de la prestation échoue, les fichiers téléversés pendant cette tentative sont supprimés du bucket lorsqu’il le permet ; un échec du nettoyage est signalé.
- `ChatPanel.tsx` affiche les erreurs de lecture des conversations/messages/devis au lieu de traiter silencieusement un résultat nul comme une boîte vide. Il ne lit pas les offres de prix produit pour un fil de devis prestataire, donne aux prestataires sans discussion un lien vers leurs demandes et indique l’état du canal temps réel.
- Une règle pure de plafond d’images et des tests associés ont été ajoutés.

## Vérifications locales

Après installation des dépendances verrouillées :

- `pnpm test` : **49 tests réussis / 12 fichiers** après les dernières modifications de messagerie.
- `pnpm typecheck` : réussi.
- `pnpm lint` : réussi.
- `pnpm build` : réussi.

Aucun test E2E authentifié ni test RLS/Supabase en environnement de test n’a été exécuté. Les tests confirment la qualité de compilation et les comportements unitaires couverts, pas l’état des services réels.

## Git et déploiement

La publication demandée se fait sur une branche séparée afin de ne pas modifier directement `main`. Aucun déploiement Vercel, changement de secret, écriture de base ou exécution de migration n’est inclus. Pour que le code apparaisse sur le SaaS, il faudra ensuite intégrer/déployer la branche ; pour le module prestataire, il faudra également vérifier puis appliquer la migration compatible au projet Supabase visé, avec son autorisation distincte.
