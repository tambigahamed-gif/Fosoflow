# Audit fonctionnel et recommandations UX — FasoFlow

**État observé :** 23 novembre 2026. Le dépôt est au commit `fbcc718` sur `main`. Audit en lecture seule du site public et des routes prestataire avec une session autorisée, complété par une revue statique du front. Aucun formulaire n’a été soumis; aucun message, devis, paiement ou donnée Supabase n’a été écrit.

## Bugs confirmés sur le parcours prestataire

### 1. Les routes prestataire affichaient le mauvais écran — corrigé et contrôlé en ligne

La version précédente déclarait `/provider/profile`, `/provider/services`, `/provider/requests` et `/provider/messages` comme routes statiques, tandis que `ServiceProviderDashboardPage` attendait le paramètre dynamique `section`. Ces URLs affichaient donc le tableau de bord au lieu de leurs panneaux; le bouton pour créer le profil renvoyait vers la même page. Ce défaut empêchait effectivement de démarrer l’inscription métier.

Correction poussée sur GitHub à `fbcc718` : les sous-routes passent maintenant par `:section`. Vérification navigateur après le déploiement : Profil affiche son formulaire; Prestations affiche sa page et le prérequis de profil; Demandes affiche son état vide. La navigation Messages ouvre aussi son panneau, mais un autre défaut y persiste.

### 2. L’indicateur Realtime de la messagerie reste bloqué sur « Connexion en cours… »

Reproduit plusieurs fois sur `/provider/messages`. La messagerie indique qu’il n’y a aucune discussion, mais le badge reste sur « Connexion en cours… ». Dans `src/features/messaging/ChatPanel.tsx`, le statut part à `connecting`; l’effet qui ouvre le canal Realtime retourne immédiatement quand aucune conversation n’est sélectionnée. Aucun chemin ne change alors le badge. Il faut distinguer explicitement « aucune conversation »/« en attente de sélection » de « connexion à une conversation » et de « connexion indisponible ». Le défaut est visuel et peut faire croire que la messagerie charge encore.

Le panneau Demandes, contrôlé en ligne, indique « Aucune demande reçue ». La revue Supabase antérieure a trouvé zéro demande pour les comptes prestataires concernés. Cela correspond à l’état vide attendu; il ne s’agit pas d’une preuve que le chargement échoue. Aucune création de demande n’a été tentée.

## Autres défauts et risques repérés dans le code

Ces points ci-dessous sont **statiques**, et n’ont pas tous été reproduits dans une session utilisateur. Ils doivent être traités comme des bugs à confirmer par des tests ciblés, et non comme des incidents de production déjà démontrés.

1. **Devis client — exception potentiellement hors gestion d’erreur.** Dans `src/pages/services/ServicesPages.tsx` (conversion du champ `datetime-local` avant le `try`), `new Date(localDate).toISOString()` peut lever sur une valeur invalide sans passer dans le traitement d’erreur du formulaire. Valider la date et effectuer la conversion dans le `try`; afficher un message compréhensible plutôt que bloquer la soumission.
2. **Demandes livreur et espace client — erreurs de lecture parfois confondues avec un résultat vide.** `src/pages/courier/CourierDeliveriesPage.tsx` et `src/pages/client/DashboardPage.tsx` exploitent certaines réponses sans afficher l’erreur Supabase. Une panne réseau ou une permission RLS peut alors ressembler à « aucune course/commande ». Ajouter des états distincts `chargement`, `erreur` avec réessayer, `vide` et `données`.
3. **Sections du dashboard — destinations génériques ou fonctions non implémentées.** La revue statique trouve des entrées qui aboutissent à des panneaux génériques ou à un état vide plutôt qu’à une fonction métier dédiée, selon le rôle. Pour chaque lien, confirmer que la destination est réellement active; masquer les contrôles non pris en charge ou annoncer clairement « bientôt disponible ».
4. **Actions d’administration — certains sélecteurs peuvent sembler actifs sans transition métier.** Dans `src/pages/admin/AdminOperationsPage.tsx`, certaines sections tombent dans un message disant qu’aucune transition directe n’existe. N’afficher un sélecteur que quand une transition est supportée. Avant toute approbation sensible, notamment un paiement déclaré manuellement, présenter une confirmation avec montant, référence et bénéficiaire.
5. **Tableau prestataire — diagnostic trop générique en cas d’échec de lecture.** Le dashboard capture les erreurs de profil/prestation et les remplace par un état général « non vérifiable ». Afficher le message de diagnostic et un bouton Réessayer directement, en distinguant erreur réseau et absence de profil.
6. **Demande de devis — succès partiel peu explicite.** Si la création de demande réussit mais que la seconde RPC de conversation échoue, l’utilisateur reçoit un message de succès et est redirigé vers ses demandes. Dire explicitement que la demande est enregistrée mais que la discussion n’a pas pu s’ouvrir, avec un moyen de réessayer.
7. **Accessibilité du tarif — groupe de boutons incomplet.** Le sélecteur d’audience de la page Tarifs semble modifier l’affichage sans état sémantique annoncé (`aria-pressed` ou groupe équivalent). Ajouter l’état actif accessible, vérifier le parcours clavier et les contrastes.

## Recommandations d’interface inspirées des marketplaces

Les recommandations ci-dessous sont des adaptations des motifs observés, pas une demande de copier leur marque ou leurs écrans.

### Priorité 1 — Clarifier les états et guider la prochaine action

Sur chaque écran, garder des états séparés « chargement », « erreur/réessayer », « aucun résultat » et « action nécessaire ». Le bug du badge de messagerie montre pourquoi cette distinction compte. Dans l’espace professionnel, montrer une progression simple — profil à compléter, première offre à créer, en attente de modération, publié — avec une prochaine action unique bien visible. Airbnb présente le dépôt d’une prestation comme une séquence concrète (informations sur l’activité, photos, prix, revue), et regroupe ensuite réservations, calendrier et messages dans les outils de gestion de l’hôte [3]. Pour FasoFlow, un onboarding par étapes avec sauvegarde de brouillon et statut de validation rendrait la progression plus claire sans imposer réservation ou paiement.

### Priorité 2 — Rendre la recherche locale et les filtres plus utiles

CoinAfrique Burkina met en avant la recherche, les catégories, la localisation par ville, le tri par récence/prix et des filtres prix et livraison; ses cartes associent photo, prix en CFA, titre et localisation [1]. FasoFlow peut reprendre ces principes pour Produits et Services : filtres visibles de ville, catégorie et fourchette de prix; tri simple; bouton « Effacer les filtres »; cartes lisibles sur mobile avec tarif/devis, ville et disponibilité clairement affichés. Éviter les filtres cachés dans une longue page, surtout sur téléphone.

### Priorité 3 — Structurer les annonces et renforcer les signaux de confiance

Pour une fiche produit, hiérarchiser image, nom, prix en XOF, état, disponibilité et boutique. Pour une prestation, afficher photo du professionnel ou du travail, domaine, zone d’intervention, tarif ou « sur devis », statut de validation et avis lorsqu’ils existent. Airbnb Services met de l’avant des exemples visuels de services et la création de fiches avec photos et prix avant revue [3]. CoinAfrique montre aussi l’importance de repères immédiatement scannables — localisation et prix — et de favoris [1]. Toute mention « vérifié », note ou avis doit provenir d’une donnée réellement contrôlée et ne pas être décorative.

### Priorité 4 — Faire du tableau vendeur un centre de travail

Etsy organise son aide vendeur autour de « Getting Started » et « Growing Your Business », et documente la gestion des messages comme un canal central, avec réponses rapides et organisation de la boîte de réception [2][4]. FasoFlow peut prioriser sur le dashboard des tâches réelles : demandes à répondre, devis en attente, fiches à corriger, prestations en revue, messages non lus. Une boîte de réception avec état de connexion exact, filtre par demande/client et réponses rapides de base serait plus actionnable que des tuiles qui mènent à des pages sans données.

### Priorité 5 — Simplifier le mobile et l’accessibilité

Le site est testé ici en navigateur desktop; il faut vérifier manuellement ou par E2E les mêmes routes sur petit écran. Sur mobile, utiliser des boutons pleine largeur pour les actions primaires, conserver le titre de section et l’état actif du menu, éviter que les libellés soient tronqués, conserver le formulaire avec un clavier adapté au type de champ, et rendre les états/focus utilisables au clavier et lecteur d’écran. Ajouter aux formulaires de création une progression/complétude, des exemples de saisie et une confirmation d’envoi à modération.

## Couverture réelle de cette vérification

Routes contrôlées en session prestataire : Profil, Prestations, Demandes et Messages. Résultats observés : formulaire profil présent; prérequis de profil sur prestations; aucune demande; aucune discussion; statut Realtime bloqué en connexion. Aucun envoi de message, soumission de profil, ajout de prestation, devis, paiement ou action admin n’a été essayé. Les autres espaces n’ont pas été parcourus dans une session de chaque rôle; leurs constats viennent de la revue statique du code. Les tests automatisés du dépôt précédemment exécutés sont 50/50, et typecheck, lint et build passaient après le correctif de routage, mais ces tests ne démontrent pas le fonctionnement intégral des intégrations Supabase en production.

## Références

[1]: https://bf.coinafrique.com/ "CoinAfrique Burkina Faso — petites annonces et filtres"
[2]: https://www.etsy.com/seller-handbook "Etsy Seller Handbook"
[3]: https://www.airbnb.com/host/services "Airbnb Services — présenter et gérer une activité de services"
[4]: https://help.etsy.com/hc/en-us/articles/115015654988-How-to-Send-Messages-to-Buyers "Etsy Help — communiquer avec les acheteurs"
