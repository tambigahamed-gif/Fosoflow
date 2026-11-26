# Rapport d’état FasoFlow — phases 1 à 9

**Date :** 26 novembre 2026  
**Dépôt :** `tambigahamed-gif/Fosoflow`, branche `main` précédemment poussée au commit `8eed919`  
**Vérification navigateur :** `https://fasoflowbf.vercel.app/`, session publique non authentifiée, affichage desktop observé à 1706 × 1466 px.

## Synthèse

Les phases ne sont pas toutes « terminées ». Les phases 1 à 6 ont reçu des corrections dans le code des travaux précédents et les phases 7 à 9 des changements locaux ont été testés et poussés, mais les parcours complets par rôle et plusieurs intégrations ne sont pas vérifiés. Trois migrations ont été appliquées au projet Supabase FasoFlow : 016, 017 et le correctif 018. Le contrôle navigateur a révélé un effet de bord de 017 sur la page Services; 018 a rétabli l’accès du helper RLS public et le contrôle suivant a montré une prestation visible. Cela ne constitue pas une validation complète de la sécurité, ni un test E2E authentifié.

## État phase par phase

| Phase | État actuel | Preuves et limites |
| --- | --- | --- |
| **1 — Sécurité et bugs critiques** | **Partiellement traitée** | Des corrections ont été apportées antérieurement aux policies/RPC et la policy d’avis 016 a corrigé une condition distante erronée (`orders.shop_id` comparé à lui-même). Les migrations 017/018 ferment 22 RPC internes à `anon` tout en maintenant le helper public nécessaire aux policies des services. Il reste à auditer l’ensemble des policies, fonctions, Storage et permissions par rôle; aucune certification générale RLS n’est établie. |
| **2 — Marketplace et produits** | **Partiellement fonctionnelle, parcours incomplet** | Le navigateur public affiche deux produits sur `/marketplace`; l’un est signalé « Rupture de stock ». Filtres catégorie, boutique, ville, prix, état et tri sont visibles. Une boutique apparaît sur `/shops`. La création/modification/modération complète et l’égalité des résultats selon les rôles n’ont pas été E2E testées. |
| **3 — Services et prestataire** | **Affichage public vérifié après correctif; parcours privé non vérifié** | `/services` a d’abord échoué après 017 avec `permission denied for function is_service_provider`. 018 a rétabli l’accès requis par la policy publique; la visite suivante affiche une prestation « Hamed ». Cela prouve l’affichage public au moment du test, pas l’inscription, la sauvegarde de profil, les devis ou les transitions avec session prestataire/client. Le fichier 015 exact n’a pas été appliqué pendant cette intervention; sa structure paraissait présente lors d’une vérification précédente, sans preuve d’exécution exacte. |
| **4 — Commandes, livreurs et messagerie** | **Partiellement implémentée, E2E à faire** | Des corrections de code antérieures couvrent commandes, livraison, chat et notifications. Aucun essai réel de commande, acceptation concurrente d’une course, conversation authentifiée, notification ou progression de statut n’a été effectué dans cette vérification. |
| **5 — Paiements, wallet et finances** | **Contrôles du code, intégration réelle non validée** | Les vérifications SasPay sont couvertes par des tests locaux et l’API de vérification exige un contrôle serveur. Aucun paiement réel/sandbox ni webhook réel n’a été exécuté. Le modèle distant/local ne justifie pas d’affirmer que retraits, remboursements, ledger wallet, commissions ou règlements sont disponibles. |
| **6 — Abonnements** | **Partiellement traitée** | Les règles de plans et contrôles locaux ont des tests; l’activation/expiration distante, le cron en production, le renouvellement et les limites autoritaires n’ont pas été vérifiés par parcours connecté. Aucun abonnement prestataire payant n’est introduit. |
| **7 — Interface et expérience utilisateur** | **Corrections ciblées; reste ouvert** | Le menu public mobile a cinq destinations et l’état de recherche/chargement bénéficie de libellés accessibles dans le code. L’accès Notifications a été ajouté à la navigation des cinq rôles. Le navigateur public confirme le rendu desktop des pages consultées. Responsive à petit écran, navigation authentifiée, paramètres/profils et audit accessibilité exhaustif non vérifiés dans le navigateur. |
| **8 — Super Admin** | **Incomplète** | Les sections admin et transitions RPC déjà présentes sont conservées. Des besoins demeurent absents ou partiels : suspensions de comptes, retraits/commissions, litiges financiers, journal global d’audit, statistiques/flux dédiés. Certaines listes sont plafonnées à 100. Ni l’interface admin ni les opérations sensibles n’ont été parcourues avec un compte admin dans le navigateur. |
| **9 — Tests et stabilisation** | **Suite locale réussie; E2E restant** | Avant les migrations, `pnpm test` a réussi : 14 fichiers/61 tests; `pnpm typecheck`, `pnpm lint`, `pnpm build` et `git diff --check` ont réussi. Le navigateur a contrôlé les pages publiques après migrations, mais aucun E2E authentifié multi-rôle ou test mobile n’a été effectué. |

## Migrations Supabase appliquées et vérifiées

Projet `fasoflow`, référence `xmjbsurnqvwjitdalruf`, état actif.

1. **016 — `016_fix_product_review_shop_policy`** (registre `20261126131610`) : la policy d’insertion d’avis vérifie que `reviews.shop_id` correspond à la boutique de la commande livrée du même client.
2. **017 — `017_restrict_anonymous_definer_rpc`** (registre `20261126131618`) : révoque l’exécution anonyme sur les 23 fonctions ciblées. Le contrôle navigateur a ensuite révélé que `is_service_provider(uuid)` est aussi appelée par les policies RLS publiques des profils/prestations.
3. **018 — `018_restore_public_service_provider_helper`** (registre `20261126131931`) : rétablit `EXECUTE` pour `anon` sur ce helper booléen utilisé par ces policies. État final contrôlé sur les 23 signatures : `anon` refusé pour 22 RPC internes, `anon` autorisé uniquement pour `is_service_provider(uuid)`, `authenticated` autorisé pour les 23.

Le registre Supabase historique était vide avant 016; le 015 exact n’a pas été appliqué ici. Aucun DML de test ou donnée métier, secret ou paramètre distant n’a été modifié. Aucune migration destructive n’a été exécutée.

## Vérification navigateur — ce qui est effectivement appliqué

- **Accueil `/` :** identité FasoFlow, navigation, recherche, catégories et appels à l’action visibles; le flux « À découvrir maintenant » était encore dans un état de recherche lors de la capture initiale.
- **Marketplace `/marketplace` :** filtres visibles et deux annonces réelles affichées; l’une porte l’étiquette rupture de stock.
- **Boutiques `/shops` :** une boutique réelle « sport » est affichée avec lien de vitrine.
- **Services `/services` avant 018 :** erreur visible `permission denied for function is_service_provider` après 017.
- **Services `/services` après 018 :** l’erreur a disparu et une prestation réelle (« Hamed », 5 000 FCFA) est visible. Le fichier image de cette carte s’est chargé dans le navigateur.

La correction 018 a été appliquée à Supabase et le fichier de migration a été créé dans le dépôt local. **Le fichier 018 et les notes de vérification de cette intervention ne sont pas encore committés/poussés vers GitHub.** Le site public chargé ne permet pas de confirmer le SHA exact publié par Vercel. Le navigateur était à 1706 × 1466 px; il n’y avait pas de session authentifiée, et l’affichage mobile n’a pas été testé.

## Ce qui reste à faire en priorité

1. **Versionner le correctif 018 et ce rapport** (commit/push vers GitHub si demandé), afin que l’historique du dépôt reflète la base Supabase. Vérifier ensuite séparément l’état du déploiement automatique Vercel, sans le confondre avec un test fonctionnel.
2. **Tester en environnement non-production** les parcours authentifiés client, commerçant, prestataire, livreur et admin : profil, publication, devis, messages, commandes, courses, notifications et paiements sandbox. Ne pas écrire des données de test en production.
3. **Effectuer une vraie revue mobile** et clavier/lecteur d’écran des routes publiques et espaces connectés; le contrôle navigateur courant était desktop.
4. **Compléter la Phase 8** après clarification du modèle métier et autorisations pour retraits, commissions, litiges, suspensions, historique admin, pagination/recherche et statistiques. Ne pas inventer de tables ou de transitions financières.
5. **Réconcilier les migrations historiques** : présence structurelle associée à 015 observée antérieurement, mais historique ancien vide et exécution exacte inconnue. Établir les versions effectivement appliquées avant d’éventuelles migrations supplémentaires.
6. **Vérifier les services externes** par les mécanismes appropriés : SasPay sandbox et webhook, expiration/cron d’abonnement, realtime et permissions RLS multirôle. Ces vérifications ne sont pas démontrées par les tests Vitest ni par les seules pages publiques.

## Captures navigateur

- [Marketplace publique — 26 novembre 2026](/home/ubuntu/screenshots/fasoflowbf_vercel_ap_2026-11-26_13-18-49_9154.webp)
- [Services après migration 018 — 26 novembre 2026](/home/ubuntu/screenshots/fasoflowbf_vercel_ap_2026-11-26_13-19-36_4887.webp)
- [Boutiques publiques — 26 novembre 2026](/home/ubuntu/screenshots/fasoflowbf_vercel_ap_2026-11-26_13-20-18_8929.webp)
