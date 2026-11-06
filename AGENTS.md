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
- `docs/rts-orders.js` : transitions de commandes d'unités (déplacement,
  attaque, arrêt, réparations, mines, bois, coupes, récoltes, constructions, entraînement,
  améliorations, remboursements et progression des files de production) sans
  UI ni Three.js ;
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
- `docs/rts-assets.js` : transfert binaire avec gzip, fallback et métriques ;
  aucune logique Three.js, scène ni DOM. `docs/game.js` reste responsable du
  parsing des GLB et de leur installation visuelle.
- `docs/styles/` : présentation CSS ; ne doit pas modifier les règles du jeu.
- `scripts/test-*.mjs` : tests unitaires ; ajouter un test au système modifié.
- `scripts/test-rts-architecture.mjs` : garde-fou des frontières de modules,
  includes HTML, ownership, déclencheurs QA et restauration d'assets épinglés.
- `docs/rts-contracts.d.ts`, `scripts/contracts-smoke.ts` : contrats progressifs
  compilés en mode strict dans `contracts.yml`, déclenché uniquement si
  les déclarations ou ce workflow changent. Pas de TypeScript au runtime.
- `scripts/browser-qa.mjs` : orchestration des scénarios Chrome/WebGL.
- `scripts/browser-qa/{visual,economy,combat,dome,touch}.mjs` : scénarios QA
  indépendants ; modifier le fichier du scénario concerné.
- `scripts/browser-qa/chrome-driver.mjs` : transport Chrome DevTools partagé ;
  coordonner ses changements puisqu'ils affectent tous les scénarios ; une
  relance à profil neuf est permise si DevTools ne démarre pas sur le runner.
- `assets/README.md`, `assets/runtime-assets.lock` : méthode d'ajout et version
  immuable des modèles préparés, avec SHA-256. Ne pas changer le verrou sans
  une nouvelle Release vérifiée.
- `scripts/use-pinned-runtime-assets.sh` : restauration commune pour Pages et
  QA ; aucun modèle source externe n'est téléchargé à chaque commit.
- `scripts/prepare-runtime-assets.sh` : reconstruction exceptionnelle du paquet
  pour une nouvelle version (workflow `rebuild-runtime-assets.yml`).
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
