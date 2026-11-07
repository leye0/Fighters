# Consignes de développement — Fighters

Lire `refactor.md` avant une modification d'architecture. Les fonctionnalités
et le rendu actuels sont des contraintes de non-régression.
Lire également `docs/architecture.md` pour les frontières et contrats de
modules (`docs/rts-contracts.d.ts`).

## Périmètres

- `docs/index.html` : HTML, DOM, import map et démarrage. Ne pas y réintroduire
  du JavaScript de jeu inline.
- `docs/game.js` : script d'intégration historique (déplacé à l'identique depuis
  l'ancien HTML), à décomposer progressivement par périmètre. Les tests de
  câblage métier inspectent ce fichier, les tests de menu inspectent le HTML.
- `docs/rts-*.js`, `docs/orc-strategy.js`, `docs/witch-strategy.js` : règles de
  domaine ; privilégier des fonctions pures, déterministes et testables sous Node.
- `docs/rts-simulation.js` : ordonnanceur déterministe à 60 Hz et budget de
  rattrapage ; les phases nommées sont assemblées dans `docs/game.js`.
  Préserver leur ordre exact et ne pas allouer d'objets à chaque tick.
- `docs/rts-match-state.js` : propriétaire des ressources or/bois/magie d'une partie,
  avec réinitialisation en valeurs neuves ; les autres systèmes ne gardent
  jamais leurs références après une nouvelle partie.
- `docs/rts-world-state.js` : propriétaire des conteneurs stables d'unités,
  bâtiments, chantiers et souvenirs du brouillard ; la remise à zéro des
  éléments 3D reste dans `game.js` pour préserver l'ordre de destruction.
- `docs/rts-orc-forager.js` : exécution d'une chasse ou récupération de cadavre
  par un orc, avec poursuite réelle, réservation de proie, animation et
  restitution à l'économie injectées ; `rts-orc-hunt-planner.js` choisit la proie.
- `docs/rts-orc-hunt-planner.js` : attribution des chasses (cadavres prioritaires,
  lièvres, brouillard, limites de tâches, menaces, exploration) et cadencement
  de 800 ms ; `rts-orc-forager.js` exécute ensuite la chasse physique.
- `docs/rts-food-cycle.js` : pas alimentaire des deux factions : apparition des
  lièvres, consommation, répartition des ouvriers, maturation des cultures et
  famine (un seul avertissement par épisode). Les effets visuels, les dégâts
  fatals et les règles économiques restent injectés par `game.js`.
- `docs/rts-raven-distraction.js` : automate de diversion des combattants orcs
  par les corbeaux ; seuls les oiseaux effectivement visibles sont poursuivis,
  aucune attaque ni dégât n'est dirigé vers un corbeau. Navigation et animations
  restent injectées par l'adaptateur de simulation.
- `docs/rts-healing-cycle.js` : soins automatiques et retraite vers les cercles
  de pierres, avec cadence de 850 ms et magie partagée, réellement débitée à
  chaque restauration. Les ressources neuves après reset sont lues/écrites via
  les fonctions injectées, sans référence périmée à une ancienne partie.
- `docs/rts-soul-harvester.js` : sélection et réservation de cadavres visibles
  par les mages, cadence de 650 ms, poursuite, annulation et attente de la pose
  réelle `Death01`. L'effet 3D d'âme est créé séparément dans `game.js`.
- `docs/rts-mining-cycle.js` : attribution automatique des mineurs, extraction
  au contact et retour physique de l'or à une base alliée. Le trésor (réinitialisé
  à chaque partie), le chargement 3D et les alertes sont injectés par `game.js`.
- `docs/rts-wood-cycle.js` : attribution des bûcherons, choix des arbres visibles,
  coupe, réservation des bûches, ramassage et livraison du bois. Le module
  restitue les bûches à l'annulation d'un trajet chargé ; les modèles 3D,
  messages et ressources courantes sont adaptés par `game.js`.
- `docs/rts-garden-worker-cycle.js` : attribution cadencée des jardinières,
  réservation des rangs mûrs, récolte, transport physique du blé et livraison
  à une maison ; les animations, visuels et effets restent injectés par `game.js`.
- `docs/rts-berry-forager-cycle.js` : attribution automatique de deux cueilleuses
  au maximum, vigilance des combattantes, navigation et consommation sur place ;
  l'économie des buissons et leur rendu restent injectés par `game.js`.
- `docs/rts-construction-worker-cycle.js` : trajet vers le chantier, animations,
  durée d'ouvrage, annulation et remboursement, achèvement et paiement
  conditionnel ; les aperçus et réalisations 3D restent injectés par `game.js`.
- `docs/rts-building-placement.js` : politique de construction indépendante du
  rendu (coûts, ouvriers, géométrie, distances, remparts et sortie du village).
  Les silhouettes, arbres, ressources et chemins actuels sont injectés depuis
  `game.js` à chaque demande ; ne pas mémoriser un ancien état de partie.
- `docs/rts-repair.js` : validation des réparations et automate des ouvriers
  réparateurs (approche, blocage, cadence et progression jusqu'aux PV maximum).
  Navigation, animation, son et affichage restent injectés par `game.js`.
- `docs/rts-unit-tick.js` : état et priorités des unités à chaque tick
  (attaque, cible, poursuite, tâches, déplacement), avec services de navigation,
  combat, animation et IA injectés une seule fois par `game.js`.
- `docs/rts-orders.js` : transitions de commandes d'unités (déplacement,
  attaque, arrêt, réparations, mines, bois, coupes, récoltes, constructions, entraînement,
  améliorations, remboursements et progression des files de production), ainsi
  que la finalisation des entraînements et des niveaux de bâtiment (apparition,
  ralliement, PV et ordre des callbacks injectés), sans UI ni Three.js ;
  `docs/game.js` adapte les événements et services sans recopier les mutations.
- `docs/rts-picking.js` : sélection des silhouettes en coordonnées écran,
  corbeaux, arbres, bois et emprises de bâtiments ; dépendances injectées
  pour les tests sans navigateur, `docs/game.js` adapte Three.js et l'état.
- `docs/rts-camera.js` : cadrage orthographique et panoramique avec dépendances
  injectées ; les événements pointeur restent dans `docs/game.js`.
- `docs/rts-gestures.js` : automate des gestes tactiles et souris (tap, pan,
  boîte à deux doigts, boîte desktop), sans état du moteur ; les callbacks
  de commandes et le viewport sont injectés par `docs/game.js`.
- `docs/rts-player-actions.js` : priorité des cibles et modes d'interaction
  après un tap, sélection de groupe par rectangle ; dépend seulement d'un
  état courant et de services injectés, sans moteur graphique.
- `docs/rts-minimap.js` : dessin Canvas 2D de la mini-carte, brouillard du sol,
  bâtiments et points d'unités ; `docs/game.js` conserve les événements d'entrée.
- `docs/rts-hud.js` : fabrication des boutons, textes de ressources et barres
  de vie du HUD ; les décisions sur les commandes disponibles restent dans
  `docs/game.js`, sans duplication du DOM dans les systèmes de gameplay.
- `docs/rts-ai-commands.js` : exécution des intentions des deux IA (construction,
  entraînement, reconnaissance, attaques, défense) ; les directeurs `*-strategy.js`
  choisissent les intentions et ne manipulent pas directement les objets 3D.
- `docs/rts-ai-observations.js` : constitution des observations remises aux deux
  directeurs, avec filtrage par le brouillard de guerre ; conserver les champs,
  les règles de visibilité et le moment de lecture des compteurs.
- `docs/rts-assets.js` : transfert binaire avec gzip, fallback et métriques ;
  aucune logique Three.js, scène ni DOM. Le parsing des GLB appartient
  maintenant à `rts-model-assets.js` et leur installation visuelle à `game.js`.
- `docs/rts-model-assets.js` : création du décodeur GLTF/Meshopt, parsing des
  GLB et cache explicite des niveaux orcs ; les scènes 3D restent construites
  dans `game.js`. Les modèles non partagés ne sont jamais mis en cache.
- `scripts/test-rts-model-assets.mjs` : assure l'initialisation Meshopt avant
  chargement, la distinction modèles partagés/frais et le parsing binaire.
- `scripts/publish-generated-result.sh` : préserve les fichiers produits par les
  workflows sous `automation-results/<workflow>/<run>-<tentative>`, puis applique
  leur commit sur la tête actuelle de `main` sans force-push ni PR ; un conflit
  échoue en conservant la branche de résultat. Les deux anciens générateurs
  musicaux gardent leurs branches de révision et n'intègrent jamais un résultat
  lancé manuellement depuis `main` sans révision.
- `scripts/test-generated-result-publish.mjs` : vérifie ces garanties dans des
  dépôts Git temporaires (cas normal, avancée concurrente, conflit).
  Les workflows à génération ou réparation ponctuelle sont lancés manuellement
  via `workflow_dispatch`, pas à chaque modification de leur propre YAML :
  éviter des générations audio coûteuses non demandées.
- `docs/styles/` : présentation CSS ; ne doit pas modifier les règles du jeu.
- `scripts/test-*.mjs` : tests unitaires ; ajouter un test au système modifié.
- `scripts/test-rts-architecture.mjs` : garde-fou des frontières de modules,
  includes HTML, ownership, déclencheurs QA et restauration d'assets épinglés.
- `scripts/test-rts-unit-tick.mjs` : régressions des attaques en cours, des
  nouveaux ordres, de l'ordre des tâches et des chemins bloqués.
- `scripts/test-rts-mining-cycle.mjs` : attribution IA, brouillard, navigation,
  durée d'extraction, transport, crédit uniquement à la livraison et annulation.
- `scripts/test-rts-wood-cycle.mjs` : planification orc/sorcière, arbres hors
  danger, coupe, ramassage, réservations, restitution, livraison et retry.
- `scripts/test-rts-garden-worker-cycle.mjs` : cadence, reset, réservations,
  trajets bloqués, durée de récolte, effet sonore et livraison effective.
- `scripts/test-rts-berry-forager-cycle.mjs` : cadence, proximité, sélection des
  rôles, menaces, interruptions, chemin bloqué et paiement alimentaire.
- `scripts/test-rts-construction-worker-cycle.mjs` : contact des chantiers,
  délais, sons, annulations, remboursements et finitions par type de bâtiment.
- `docs/rts-contracts.d.ts`, `scripts/contracts-smoke.ts` : contrats progressifs
  compilés en mode strict dans `contracts.yml`, déclenché uniquement si
  les déclarations ou ce workflow changent. Pas de TypeScript au runtime.
- `scripts/browser-qa.mjs` : orchestration des scénarios Chrome/WebGL.
- `scripts/browser-qa/{visual,economy,combat,dome,touch}.mjs` : scénarios QA
  indépendants ; modifier le fichier du scénario concerné.
- `scripts/browser-qa/chrome-driver.mjs` : transport Chrome DevTools partagé ;
  coordonner ses changements puisqu'ils affectent tous les scénarios ; une
  relance à profil neuf est permise si DevTools ne démarre pas sur le runner.
- `scripts/test-rts-chrome-retry.mjs` : simule un échec DevTools puis vérifie
  la relance unique, la limite de tentatives et les chemins de nettoyage.
  Avec `FIGHTERS_REAL_CHROME_RETRY=1`, échoue réellement au premier lancement
  et vérifie un vrai navigateur Chromium/Chrome de remplacement. Ce test est
  isolé dans `chrome-retry.yml` : pas de démarrage supplémentaire pour chaque
  test WebGL régulier.
- `assets/README.md`, `assets/runtime-assets.lock` : méthode d'ajout et version
  immuable des modèles préparés, avec SHA-256. Ne pas changer le verrou sans
  une nouvelle Release vérifiée.
- `scripts/use-pinned-runtime-assets.sh` : restauration commune pour Pages et
  QA ; aucun modèle source externe n'est téléchargé à chaque commit.
- `scripts/prepare-runtime-assets.sh` : reconstruction exceptionnelle du paquet
  pour une nouvelle version (workflow `rebuild-runtime-assets.yml`) ; utiliser
  exclusivement `npm ci` et les versions de `package-lock.json`.
- `package.json`, `package-lock.json`, `scripts/test-runtime-build-manifest.mjs` :
  manifeste et verrou de l'outillage GLB/Three.js/Sharp/Meshopt, résolus et
  revérifiés par `build-lock.yml` sur changement du manifeste. Ne pas employer
  de téléchargement npm flottant dans le build exceptionnel.
- `.github/workflows/` : génération, validation et publication ; éviter les
  modifications concurrentes de `main` par plusieurs jobs.

## Collaboration et intégration

1. Inspecter le `main` actuel et les modifications en cours avant d'éditer.
2. Pour plusieurs agents, attribuer des fichiers/systèmes disjoints et un
   worktree ou une branche isolée à chacun. Ne jamais faire modifier le même
   fichier simultanément sans coordonnateur.
3. Les petits changements peuvent être intégrés directement à `main` si le
   propriétaire le demande ; vérifier la tête distante juste avant l'écriture.
   Ne jamais forcer une référence distante pour contourner un conflit.
4. Pour une extraction, conserver le comportement, les valeurs et l'ordre des
   opérations du pas fixe. Ne pas profiter du déplacement pour changer le jeu.
5. Ne pas committer d'assets générés, de téléchargements temporaires ou de
   captures de test sans demande explicite.
6. Cocher dans `refactor.md` uniquement les étapes réellement intégrées et
   validées ; signaler séparément les validations encore en attente.

## Vérifications minimales

- `node scripts/test-rts-*.mjs` (via boucle ou commande équivalente)
- `node scripts/test-orc-strategy.mjs`
- `node scripts/test-witch-strategy.mjs`
- `node --check scripts/browser-qa.mjs` et tous les fichiers
  `scripts/browser-qa/*.mjs`
- `git diff --check`
- `bash -n scripts/prepare-runtime-assets.sh`
- `bash -n scripts/use-pinned-runtime-assets.sh`
- Pour HTML, CSS, entrées, simulation et rendu : QA réelle dans
  `.github/workflows/browser-qa.yml` (`visual`, `economy`, `combat`).

Les scripts des modèles 3D et les licences sont des éléments de production ;
préserver les sources et les attributions existantes.
