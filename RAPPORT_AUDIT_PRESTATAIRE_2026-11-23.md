# Rapport d’audit et de réparation — espace prestataire FasoFlow

**Date :** 23 novembre 2026
**Dépôt local :** `/home/ubuntu/fasoflow-local/repo` — branche `main`, commit de base `32ed2da`
**Portée :** audit du parcours existant, corrections locales seulement. Aucun push GitHub, commit, déploiement ou changement de schéma n’a été effectué.

## Résumé exécutif

Le problème principal confirmé est un décalage entre le **compte** et le **profil métier** : l’utilisateur peut avoir le rôle `service_provider` sans disposer d’une ligne dans `service_provider_profiles`. Le déclencheur `handle_new_user` crée le profil de compte générique, mais pas le profil professionnel. L’Admin liste les profils professionnels, et non tous les comptes portant le rôle prestataire. Le gestionnaire des prestations dépend lui aussi de l’existence du profil métier. Cela explique les comptes prestataires créés mais absents de la liste des profils et le parcours qui pouvait sembler vide ou bloqué.

Au moment des lectures Supabase, il y avait **2 comptes** de rôle `service_provider`, **0 profil professionnel**, **0 prestation** et **0 demande**. Aucune tentative de sauvegarde de profil n’était visible dans la vidéo fournie; les données seules ne prouvent donc pas qu’une requête d’enregistrement a été tentée ou rejetée. L’audit statique n’a pas trouvé de gestionnaire manifestement absent dans le parcours central; il a en revanche révélé une première étape de profil insuffisamment guidée et des traitements réseau susceptibles de laisser des états de chargement ou d’action bloqués.

## Corrections locales

- À la connexion et à l’inscription, un prestataire sans profil métier est dirigé vers `/provider/profile`. Après la première création du profil, il est envoyé vers `/provider/services?create=1`, où le formulaire de première prestation s’ouvre automatiquement. Les rôles client, commerçant et livreur conservent leur destination habituelle.
- Le tableau de bord prestataire annonce explicitement si le profil ou la première prestation manque, et propose l’action suivante. L’Admin indique pourquoi un compte sans profil métier n’apparaît pas dans la liste des prestataires.
- Les formulaires de profil et de prestations, demandes/devis, messagerie, et la soumission d’une demande de devis client affichent mieux les erreurs réseau et libèrent leurs états `busy`/chargement en cas d’échec. Les appels utilisent les tables et RPC déjà existantes; aucun contournement RLS n’a été ajouté.
- Des tests unitaires couvrent la destination d’onboarding selon le rôle et la présence du profil.

## Fichiers modifiés

- `src/app/auth.ts` et `src/pages/auth/AuthPage.tsx` — destination par rôle, redirection prestataire sans profil, vérification du schéma prestataire et état réseau de l’authentification.
- `src/pages/services/ServiceProviderDashboardPage.tsx` et `src/pages/services/ProviderProfileForm.tsx` — explication de l’onboarding, sauvegarde/retour après création et gestion d’erreurs.
- `src/pages/services/ProviderServicesManager.tsx` — prérequis de profil, ouverture de la première prestation, gestion des uploads et du formulaire.
- `src/pages/services/ProviderRequestsPanel.tsx` et `src/features/messaging/ChatPanel.tsx` — retours d’erreur, conversations et états de chargement.
- `src/pages/services/ServicesPages.tsx` — remise à zéro fiable de l’état lors de la demande de devis.
- `src/pages/admin/AdminOperationsPage.tsx` — clarification de la liste des profils prestataires et meilleure remontée d’erreur de chargement.
- `tests/auth-session.test.ts` — test de redirection vers l’onboarding.
- `verification-supabase-migration-015-2026-11-22.txt` — observations Supabase en lecture seule, complétées sans données personnelles.

## Publication, archivage et suppression

La création ou modification d’une prestation envoie l’élément en modération. La vitrine publique filtre sur une prestation `active` et un profil prestataire `active`; l’activation et l’archivage passent par les fonctions administrateur de modération existantes. L’espace prestataire ne propose pas de suppression et ne peut pas publier/dépublier directement une prestation selon les politiques et transitions présentes dans la migration 015. Aucun droit RLS n’a été élargi et aucune action de suppression n’a été simulée. Ces écarts restent à traiter comme une décision produit/sécurité séparée, sans contourner les protections de base.

## Tests et preuves

Contrôles exécutés localement après correction :

- `npm test -- --reporter=dot` — **réussi**, 12 fichiers, 50 tests.
- `npm run typecheck` — **réussi**.
- `npm run lint` — **réussi**, sans avertissement final.
- `npm run build` — **réussi** (Vite a compilé 1 670 modules).
- `git diff --check` — **réussi**.
- Revue statique indépendante — aucun défaut fonctionnel certain supplémentaire confirmé; les limites publication/suppression ont été relevées.

Ces vérifications ne sont **pas** des tests interactifs de bout en bout. N’ont pas été testés avec une session prestataire réelle : création/mise à jour du profil en base, upload Storage, création/modification d’une prestation sous RLS, approbation et visibilité publique, appels RPC de demandes/devis, création de conversation, envoi Realtime, console navigateur, ni les boutons un par un. Aucun test d’écriture/suppression n’a été fait sur la base partagée, faute d’autorisation/plan d’essai isolé. La couverture fonctionnelle en production reste donc non mesurée; les tests automatisés actuels couvrent le code local, pas les intégrations live.

## État Supabase

Vérifications ponctuelles **en lecture seule** sur le projet `fasoflow` (`xmjbsurnqvwjitdalruf`, région `eu-west-1`) : tables de services, colonnes attendues, fonctions RPC prestataire, rôle, bucket `service-images` et RLS sont présents. `list_migrations` renvoie un historique vide : il n’est pas possible d’affirmer que le fichier 015 exact a été exécuté tel quel, bien que sa structure principale paraisse présente. Aucun DDL, DML, RPC mutante, changement de permission ou déploiement Supabase n’a été effectué. Les constats détaillés sont dans [la note de vérification Supabase](verification-supabase-migration-015-2026-11-22.txt).

## État du dépôt et déploiement

Le premier lot de corrections a été poussé sur `origin/main` au commit `91d6064`. Après la reproduction réelle, une correction supplémentaire du routeur (`src/app/router.tsx`) est présente **localement, non commitée et non poussée**. La page Vercel a été inspectée après le premier push et reproduit encore le défaut de routage; le déploiement du correctif local n’a pas eu lieu. Le push vers `main` peut déclencher Vercel, comme accepté pour le premier lot, mais toute nouvelle publication devra être confirmée séparément.

## Suite recommandée

Après validation du code local, effectuer un essai contrôlé avec un compte prestataire de test clairement identifié et un plan de création/nettoyage accepté pour la base partagée : inscription ou connexion, sauvegarde du profil, création/édition de prestation, modération Admin, affichage public, demande/devis et conversation. Décider séparément si l’archivage/suppression côté prestataire est souhaité; toute évolution doit conserver une règle RLS explicite et ne pas modifier les données de production sans accord.


## Reproduction live après le push — 23 novembre 2026

**Source et date :** observation navigateur Manus Sandbox, 23-11-2026 à 19:51–19:52 UTC, site public `https://fasoflowbf.vercel.app/`, session authentifiée par l’utilisateur sur son compte prestataire (aucun courriel ni mot de passe consigné).

- Sur `/provider/profile`, la barre latérale sélectionne « Profil professionnel », mais la zone principale rend le tableau de bord avec le message « profil métier non enregistré » et un CTA « Créer mon profil professionnel ».
- Après navigation directe vers `/provider/services`, la barre latérale sélectionne « Mes prestations », mais la zone principale est encore le même tableau de bord; le formulaire/liste de prestations n’apparaît pas.
- Aucune sauvegarde, requête de création, modération ou suppression n’a été tentée pendant cette reproduction.

**Diagnostic confirmé par rapprochement code/comportement :** le routeur utilise des segments statiques (`profile`, `services`, `requests`, `messages`) mais `ServiceProviderDashboardPage` attend un paramètre dynamique `section` via `useParams()`. Comme les routes n’introduisent pas `:section`, cette valeur est absente et le composant retombe sur sa valeur par défaut `dashboard`; les sous-sections retournent donc le tableau de bord. Le CTA du profil renvoie vers `/provider/profile`, créant une boucle sans afficher le formulaire. Les pages demandes et messages sont concernées par la même condition de routage. Ce défaut explique directement pourquoi le parcours reste bloqué après le push précédent, et pourquoi aucun profil métier n’a pu être créé depuis cette interface.


## Correction locale préparée après la reproduction

Dans `src/app/router.tsx`, les sous-routes prestataire statiques ont été remplacées par l’enfant `:section`, aligné sur le `useParams().section` déjà utilisé par `ServiceProviderDashboardPage`. `/provider/profile` rend le formulaire profil; `/provider/services`, `/provider/requests` et `/provider/messages` appellent leurs panneaux dédiés; l’index `/provider` conserve le tableau de bord. Cette correction a été poussée sur `main` au commit `fbcc718`.

Validations exécutées après ce changement : Vitest **50/50**, `typecheck` réussi, ESLint réussi sans avertissement, build Vite réussi (1 670 modules), `git diff --check` réussi. Aucune écriture Supabase ni modification des espaces client, commerçant, livreur, abonnements ou paiements n’a été effectuée. La vérification navigateur post-déploiement est décrite ci-dessous.


## Vérification navigateur après le second push — 23 novembre 2026

Commit `fbcc718` vérifié identique à `origin/main`. Après rafraîchissement de la page Vercel (le premier chargement de contrôle affichait encore l’ancien asset; la réponse HTML suivante référençait un nouvel asset), la navigation authentifiée vers `/provider/profile` affiche bien le formulaire « Profil professionnel » avec champs nom, ville, zones, présentation, téléphone public et bouton « Créer mon profil professionnel ». La route `/provider/services` affiche désormais le panneau « Mes prestations » et l’état « Compléter mon profil d’abord » / catalogue vide. Cela valide en production la correction de routage des deux sections observées. Aucun formulaire n’a été soumis, et aucune donnée Supabase n’a été écrite. Les routes demandes et messages sont raccordées au même paramètre de section dans le code, mais n’ont pas été exercées dans ce dernier contrôle live.
