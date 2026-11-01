# AGENTS.md — Fighters

Ce document s'applique à toute intervention dans le dépôt **Fighters**.

## Mandat

Construire un **beat’em up d’action 3D à défilement latéral** pour navigateur, inspiré de la structure de *Double Dragon* : exploration de rues, bâtiments et plateformes surélevées, plusieurs ennemis, déplacements X/profondeur/saut, **orientation exclusivement commandée par gauche/droite, jamais imposée par une cible**, et combats animation-first. **Aucun système de duel 1v1 historique n’est conservé.**

Le document directeur est **docs/production-plan.md**. Le consulter avant toute modification, mettre à jour les cases réalisées dans le même commit que le travail associé et ne jamais marquer une case terminée sans preuve concrète.

**Agent externe ou reprise sans historique de conversation :** commencer par le [Guide de reprise](docs/production-plan.md#guide-de-reprise-pour-agent-externe). Il décrit la scène 3D actuelle, les trois modèles, les 86 clips CC0 par rig, les tests et les tâches non approuvées.

## Méthode demandée par le propriétaire

1. **Toujours travailler directement dans main.** Ne pas créer de branche de fonctionnalité ou de pull request. Ne pas forcer les pushes et ne pas réécrire l'historique.
2. **Production dès le départ.** Aucun MVP, prototype jetable ou faux mécanisme présenté comme complet. Les étapes de réalisation peuvent être ordonnées par dépendances mais n'annulent aucune exigence du plan.
3. **Qualité mesurable.** Définir le comportement attendu, implémenter, tester, vérifier les régressions pertinentes, puis committer sur main.
4. **Architecture extensible et animation-first.** Combattants, coups, animations, arènes, sons et effets sont pilotés par des données. **Les coups du jeu final doivent provenir de clips réellement disponibles, inspectés et retargetés**, puis leurs commandes et combos sont choisis. La démo utilise trois vrais clips et des données de contact/dégâts **explicitement provisoires**, sans prétendre à une approbation esthétique ou biomécanique. Voir `docs/animation-first.md`.
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
- Ennemis multiples et ciblage technique optionnel, **sans orientation automatique vers eux**. Les seules commandes gauche/droite déterminent le facing ; à l'arrêt il reste inchangé même lorsqu'un adversaire passe derrière.
- Décrire les plateformes et obstacles par des données génériques. **Décor de test volontairement minimaliste** (blocs/plans) jusqu’à l’achèvement des mécanismes, puis design photoréaliste des lieux. Voir [docs/beat-em-up-architecture.md](docs/beat-em-up-architecture.md).
- **Caméra solo : héros centré sur l’image** tant que le scrolling reste possible ; seuls les bords gauche, droit, haut ou bas du niveau autorisent son décentrage.
- Les hitboxes, hurtboxes, timings, états et dégâts proviennent des données de simulation ; le squelette visuel ne décide jamais du résultat d'un coup.
- **Physique à l'ancienne, décision de Léon :** pas de moteur physique général pour les interactions entre personnages, **pas de pushbox solide acteur–acteur**. Héroïne et ennemis peuvent se superposer et se traverser. Les collisions d'attaque restent des tests de hitboxes/hurtboxes séparés. Les obstacles et plateformes suivent un moteur cinématique maison à règles explicites (appui, saut, escalade contextuelle, chute, surface traversable sur commande), sans rigid bodies ni solveur de foule. Ne jamais « réparer » le chevauchement des personnages en rajoutant une séparation physique.
- Replays reproductibles, tests de règles, données de frame, tests navigateur et mesure de performance.
- Priorité simultanée au **rendu photoréaliste maximal** et à la **fluidité/puissance mesurée**. Les profils dégradés restent explicites ; la référence de qualité Ultra ne doit pas être abaissée tacitement.

## QA de gameplay et IA

- Le moteur courant `src/engine/beat-combat.ts` applique aux héroïnes et ennemis les mêmes fenêtres de contact/dégâts à 60 Hz. `npm test` vérifie la reproductibilité, les échanges, la victoire/défaite et les volumes X/Z/Y ; WebSuite capture le vrai WebGL des deux héroïnes et du combat. Voir `docs/ai-combat-qa.md`.
- **Ne jamais déduire qu'un combat est « fun » à partir de simples statistiques.** Faire tester la démo WebGL à Léon à vitesse réelle avant toute validation de ressenti.
- La simple présence des 86 animations CC0 sur chaque personnage ne signifie pas que les coups et leurs contacts ont été approuvés.
- Les trois coups de démo requièrent chacun leur **vrai clip exact** intégré aux trois GLB. Ils ne deviennent des attaques de production inscrites dans `assets/animation-inventory.json` qu’après revue effective des contacts sur chaque morphologie.

## Pipeline unique — Quaternius CC0, automatique et vérifiable

- **Seules sources d’animation :** Quaternius Universal Animation Library Standard 1 + 2 sous CC0, 43 clips de chaque pack intégrés directement aux **trois vrais squelettes** Claudia, Carla, Realistic Man, soit 86 clips par personnage. Voir `docs/quaternius-pipeline.md`.
- Génération et tests dans `scripts/build-quaternius-animations.mjs` et `scripts/check-quaternius-models.mjs` ; les deux archives ZIP sont figées par SHA-256. Workflow GitHub Actions autorisé sur `main` pour construire et publier les GLB et le site. Aucun compte ni intervention d'export manuel nécessaire.
- **Interdire les correctifs anatomiques par personnage ou rotation codée à la main.** En cas de rig incompatible, la génération doit échouer et ne jamais publier un avatar factice. La qualité visuelle doit être vérifiée honnêtement sur les vraies morphologies.
- Les 86 clips fournissent une bibliothèque de mouvements, **pas une liste de frappes aux contacts validés**. Les trois attaques F/G/H infligent des dégâts dans la **démo provisoire** ; les valeurs d’impact n’ont pas fait l’objet de revue artistique humaine.

## Statut du projet

Fighters est **non commercial pour le moment**, selon le propriétaire. Ce statut ne donne pas le droit de republier des animations ou modèles tiers dans un dépôt public sans respecter leur licence. Préserver la possibilité de réévaluer les droits si la diffusion change.

## Ressources tierces

- Dépôt **public** : **ne jamais committer** un modèle, une animation, un son ou une texture dont la redistribution publique n'est pas expressément compatible avec sa licence.
- **Décision de Léon pour Sketchfab :** télécharger et conserver directement dans GitHub les **modèles humains bruts** dont la licence permet la redistribution (notamment CC BY avec attribution), même si les archives sont volumineuses (Git LFS). **Aucune interdiction générale des modèles bruts ou obligation de les garder seulement hors Git.** Le contrôle de provenance, la licence et les crédits s'appliquent au fichier exact ; leur acquisition ne signifie pas que le modèle est validé visuellement ou retargeté.
- Les packs Quaternius utilisés sont les éditions Standard identifiées CC0 par l’auteur ; conserver leurs URLs et SHA fixes. Les licences des modèles Sketchfab CC BY sont distinctes.
- Privilégier CC0. CC BY est envisageable avec crédits corrects et conditions vérifiées. Les licences NC et les droits incertains ne doivent pas entrer dans le produit commercialisable.
- Pour tout asset : URL source, auteur, licence, obligations, date, formats, hash et statut de validation dans le registre.
- Respecter droits à l'image, marques et personnages protégés. Fighters doit posséder une identité visuelle originale.
- Ne jamais affirmer qu'une licence est validée sans l'avoir vérifiée pour **l'asset précis**.

- **QA perceptuelle avant de valider le rendu final :** utiliser les scénarios WebGL `tests/browser/beat-em-up-*.json` via `.github/workflows/beat-webgl-qa.yml` et inspecter les PNG de vrais modèles (repos, marche droite/gauche, saut, coups, réactions). Les assertions doivent couvrir les dimensions et projections des trois rigs, pas seulement des bones qui bougent ou des URLs 200. Le rendu logiciel CI ne valide ni les FPS iPhone ni le jugement esthétique. Ne pas réintroduire la normalisation pré-animation qui rendait les ennemis invisibles (620 m de hauteur animée).
## Définition de terminé

Une tâche est terminée seulement lorsqu'elle a :
- un résultat fonctionnel concret ;
- les tests et contrôles pertinents exécutés avec résultat connu ;
- une qualité/performance proportionnée à l'usage ;
- ses données et droits documentés le cas échéant ;
- le plan mis à jour.

Rapporter honnêtement ce qui reste à faire et tout blocage. Ne jamais présenter une coquille vide comme un jeu jouable.
