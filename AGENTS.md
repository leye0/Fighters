# AGENTS.md — Fighters

Ce document s'applique à toute intervention dans le dépôt **Fighters**.

## Mandat

Construire un **beat’em up d’action 3D à défilement latéral** pour navigateur, inspiré de la structure de *Double Dragon* : exploration de rues, bâtiments et plateformes surélevées, plusieurs ennemis, déplacements X/profondeur/saut, **orientation exclusivement commandée par gauche/droite, jamais imposée par une cible**, et combats animation-first. Le duel d’arène 1v1 existant est un **banc de simulation hérité**, pas l’expérience principale.

Le document directeur est **docs/production-plan.md**. Le consulter avant toute modification, mettre à jour les cases réalisées dans le même commit que le travail associé et ne jamais marquer une case terminée sans preuve concrète.

**Agent externe ou reprise sans historique de conversation :** commencer par le chapitre [Guide de reprise pour un agent de développement externe](docs/production-plan.md#guide-de-reprise-pour-agent-externe). Il précise le véritable état du code, les 63 clips retenus, les incompatibilités du moteur 1v1, le prochain écran 3D minimaliste, les tests et le déploiement Pages.

## Méthode demandée par le propriétaire

1. **Toujours travailler directement dans main.** Ne pas créer de branche de fonctionnalité ou de pull request. Ne pas forcer les pushes et ne pas réécrire l'historique.
2. **Production dès le départ.** Aucun MVP, prototype jetable ou faux mécanisme présenté comme complet. Les étapes de réalisation peuvent être ordonnées par dépendances mais n'annulent aucune exigence du plan.
3. **Qualité mesurable.** Définir le comportement attendu, implémenter, tester, vérifier les régressions pertinentes, puis committer sur main.
4. **Architecture extensible et animation-first.** Combattants, coups, animations, arènes, sons et effets sont pilotés par des données. **Les coups du vrai jeu doivent provenir de clips réellement disponibles, inspectés et retargetés**, puis leurs commandes et combos sont choisis. Le `MOVE_CATALOG` de 71 idées n'est qu'une fixture du moteur et ne doit jamais servir d'arsenal de production. Voir `docs/animation-first.md`.
5. **Personnages 3D réels dès maintenant.** Léon a précisé que les volumes provisoires valent pour le décor et les plateformes, **pas pour les personnages** : une capsule/silhouette ne prouve aucun progrès sur les rigs, proportions, textures, contacts ou animations. Les marqueurs peuvent subsister dans des tests techniques isolés, mais aucun jalon personnages ou gameplay visuel ne peut être validé sans de vrais humains 3D riggés. Utiliser d'abord **les candidats déjà inscrits dans `assets/manifest.json` et `docs/asset-register.md`** ; ne pas repartir en recherche générale de modèles.
   **Casting narratif approuvé :** quatre héroïnes adultes sélectionnables — femme de bureau noire, femme de bureau blanche, femme trans, hipster engagée à gauche — qui affrontent des misogynes, proxénètes, machos et « douches ». Le catalogue acquis propose Claudia et Carla comme candidates héroïnes, Realistic Man comme candidat ennemi, **sans attribution visuelle définitive**. Voir les tâches précises de casting dans `docs/production-plan.md`.
6. **Ne pas inventer de validation visuelle.** Lorsque la perception humaine du rendu ou du gameplay est nécessaire, fournir une version testable et demander au propriétaire de juger ; ne pas créer un processus « Lab » autonome qui s'arrogerait cette validation.
7. **Respecter les changements existants.** Vérifier l'état et les instructions du dépôt avant d'éditer. Ne pas supprimer de travail sans ordre explicite.
8. **Ne pas multiplier inutilement les actions CI payantes.** Privilégier validations locales adaptées, workflows ciblés, cache et annulation des exécutions périmées.
9. **Double objectif indissociable : puissance et photoréalisme.** Ne jamais considérer une belle image figée comme une preuve de jeu performant ; ne pas dégrader silencieusement le rendu haut de gamme pour atteindre une cible FPS. Mesurer CPU/GPU, cadence et qualité visuelle ensemble.
10. **Captures Web : réutiliser WebSuite de WarConquer.** La version générique est dans [WarConquer/scripts/websuite.mjs](https://github.com/leye0/WarConquer/blob/main/scripts/websuite.mjs). Pour Fighters, l'adapter au serveur Vite, à l'initialisation du canvas WebGL et aux profils GPU. Voir [docs/visual-qa.md](docs/visual-qa.md). Ne pas importer le workflow WarConquer tel quel, ses PR, ses scènes de démonstration ou son Perception Lab.

## Architecture cible

- TypeScript/Vite, Three.js avec WebGL 2 ; WebGPU seulement derrière un adaptateur et après évaluation.
- Simulation autoritative à **60 ticks/s** séparée du rendu et de l'animation.
- Affichage 3D avec caméra latérale qui défile : X = progression, Z = profondeur de la rue, Y = vraie élévation des plateformes (toits, bacs de poubelles, escaliers). Les trois axes sont simulés à 60 Hz en millimètres entiers.
- Ennemis multiples et ciblage technique optionnel, **sans orientation automatique vers eux**. Les seules commandes gauche/droite déterminent le facing ; à l'arrêt il reste inchangé même lorsqu'un adversaire passe derrière. Le demi-tour Mixamo peut être visuel, court et interruptible, mais ne doit jamais bloquer le déplacement choisi.
- Décrire les plateformes et obstacles par des données génériques. **Décor de test volontairement minimaliste** (blocs/plans) jusqu’à l’achèvement des mécanismes, puis design photoréaliste des lieux. Voir [docs/beat-em-up-architecture.md](docs/beat-em-up-architecture.md).
- **Caméra solo : héros centré sur l’image** tant que le scrolling reste possible ; seuls les bords gauche, droit, haut ou bas du niveau autorisent son décentrage.
- Les hitboxes, hurtboxes, timings, états et dégâts proviennent des données de simulation ; le squelette visuel ne décide jamais du résultat d'un coup.
- **Physique à l'ancienne, décision de Léon :** pas de moteur physique général pour les interactions entre personnages, **pas de pushbox solide acteur–acteur**. Héroïne et ennemis peuvent se superposer et se traverser. Les collisions d'attaque restent des tests de hitboxes/hurtboxes séparés. Les obstacles et plateformes suivent un moteur cinématique maison à règles explicites (appui, saut, escalade contextuelle, chute, surface traversable sur commande), sans rigid bodies ni solveur de foule. Ne jamais « réparer » le chevauchement des personnages en rajoutant une séparation physique.
- Replays reproductibles, tests de règles, données de frame, tests navigateur et mesure de performance.
- Priorité simultanée au **rendu photoréaliste maximal** et à la **fluidité/puissance mesurée**. Les profils dégradés restent explicites ; la référence de qualité Ultra ne doit pas être abaissée tacitement.

## QA de gameplay IA contre IA

- Le banc historique `npm run simulate:ai` évalue des **duels 1v1 de simulation** à 60 ticks/s avec les mêmes `InputFrame` que les joueurs ; il n’est pas le scénario principal de production. Les tests doivent vérifier la reproductibilité, la présence d'échanges, les attaques spéciales et les avertissements d'inactivité.
- **Ne jamais déduire qu'un combat est « fun » à partir de simples statistiques.** Après intégration de deux combattants photoréalistes et d'animations, exécuter un véritable match IA contre IA dans WebGL, l'enregistrer avec WebSuite et demander au propriétaire une appréciation à vitesse réelle. Voir `docs/ai-combat-qa.md`.
- La simple existence d'un emplacement d'animation dans le catalogue ne signifie pas qu'un clip Mixamo a été acquis ni que sa licence a été vérifiée.
- **Aucun coup visuellement exécutable sans son vrai clip approuvé pour le personnage** : l'inventaire `assets/animation-inventory.json` doit être exploité pour créer ses moves, et la présence des clips exacts dans le GLB est obligatoire avant de lancer le match.

## Sources Mixamo WarConquer (réel, pas théorique)

- Consulter [docs/mixamo-real-sources.md](docs/mixamo-real-sources.md), [assets/mixamo-available-clips.json](assets/mixamo-available-clips.json) et [assets/mixamo-selected.json](assets/mixamo-selected.json) : 471 candidats indexés, 302 FBX/GLB privés convertis, **63 clips sources conservés par Léon** (noms exacts et SHA). Sélection humaine des vidéos ≠ retargeting ni approbation pour un personnage.
- En cas de HTTP 429, ne pas multiplier les requêtes : respecter `Retry-After`, stopper et reprendre ensuite. La commande `--workers 1 --request-interval 5` limite volontairement le débit.
- Le script `scripts/acquire-mixamo.py` acquiert les sources dans une destination **hors repo Git public**. Le script `scripts/convert-mixamo-fbx.py` les transforme en GLB animés dans une autre destination **privée** après validation FBX/SHA et vérification des canaux GLB. Ne pas committer les FBX bruts ni les GLB de clips isolés à droits incertains.
- Ces clips **ne sont pas validés pour le jeu** : `assets/animation-inventory.json` reste vide. Seuls des clips légalement vérifiés, retargetés, visionnés et avec frames de contact mesurées autorisent un coup jouable.
- Ne pas dépendre d'un transfert de navigateur Adobe fragile pour les essais techniques. Préserver la provenance Adobe; le miroir tiers ne crée aucune autorisation nouvelle.

## Statut du projet

Fighters est **non commercial pour le moment**, selon le propriétaire. Ce statut ne donne pas le droit de republier des animations ou modèles tiers dans un dépôt public sans respecter leur licence. Préserver la possibilité de réévaluer les droits si la diffusion change.

## Ressources tierces

- Dépôt **public** : **ne jamais committer** un modèle, une animation, un son ou une texture dont la redistribution publique n'est pas expressément compatible avec sa licence.
- **Décision de Léon pour Sketchfab :** télécharger et conserver directement dans GitHub les **modèles humains bruts** dont la licence permet la redistribution (notamment CC BY avec attribution), même si les archives sont volumineuses (Git LFS). **Aucune interdiction générale des modèles bruts ou obligation de les garder seulement hors Git.** Le contrôle de provenance, la licence et les crédits s'appliquent au fichier exact ; leur acquisition ne signifie pas que le modèle est validé visuellement ou retargeté.
- Mixamo autorise son utilisation dans des jeux ; cela ne suffit pas à établir le droit de republier ses sources brutes dans Git.
- Privilégier CC0. CC BY est envisageable avec crédits corrects et conditions vérifiées. Les licences NC et les droits incertains ne doivent pas entrer dans le produit commercialisable.
- Pour tout asset : URL source, auteur, licence, obligations, date, formats, hash et statut de validation dans le registre.
- Respecter droits à l'image, marques et personnages protégés. Fighters doit posséder une identité visuelle originale.
- Ne jamais affirmer qu'une licence est validée sans l'avoir vérifiée pour **l'asset précis**.

- **QA perceptuelle avant d'affirmer qu'une démo est prête :** utiliser le scénario WebGL `tests/browser/beat-em-up-control.json` via `.github/workflows/beat-webgl-qa.yml` et inspecter les PNG de vrais modèles (idle, marche droite/gauche, saut, atterrissage). Les assertions doivent couvrir les dimensions et projections des trois rigs, pas seulement des bones qui bougent ou des URLs 200. Le rendu logiciel CI ne valide pas les FPS iPhone. Ne pas réintroduire la normalisation pré-animation qui rendait les ennemis invisibles (620 m de hauteur animée).\n
## Définition de terminé

Une tâche est terminée seulement lorsqu'elle a :
- un résultat fonctionnel concret ;
- les tests et contrôles pertinents exécutés avec résultat connu ;
- une qualité/performance proportionnée à l'usage ;
- ses données et droits documentés le cas échéant ;
- le plan mis à jour.

Rapporter honnêtement ce qui reste à faire et tout blocage. Ne jamais présenter une coquille vide comme un jeu jouable.
