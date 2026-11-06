# Refactorisation de Fighters

Plan de travail vivant pour rendre le jeu plus lisible, plus facile à tester et
plus simple à faire évoluer par plusieurs agents en parallèle, **sans changer
le gameplay, le rendu, les sons ou les performances**. Chaque case n'est cochée
qu'après modification, vérification et intégration dans `main`.

## Règles de progression

- Livrer des étapes petites et vérifiables. Garder le jeu jouable à chaque étape.
- Préserver les règles du jeu, les ressources et les assets existants.
- Lancer les tests Node ciblés, puis la QA Chrome/WebGL pour toute modification
  qui touche au DOM, au rendu, aux interactions ou à la simulation.
- Les fichiers sous `docs/models/` et `docs/vendor/` peuvent être générés par
  les workflows : ne pas y déplacer du code métier.
- Si plusieurs agents travaillent simultanément, leur donner des périmètres
  distincts et des worktrees/branches distincts. Une seule intégration à la
  fois dans `main`, en revérifiant sa tête avant chaque écriture.

## 1. Fondations et conflits Git

- [x] Inventorier les points de couplage (`docs/index.html`, `scripts/browser-qa.mjs`, CI).
- [x] Documenter les conventions de contribution pour agents dans `AGENTS.md`.
- [x] Isoler les styles du jeu dans `docs/styles/game.css`, sans modification visuelle.
- [x] Séparer les périmètres CSS et gameplay et faire déclencher la QA Chrome
      par les changements sous `docs/styles/**`.
- [x] Auditer les workflows historiques qui committent directement sur `main` :
      sept workflows ont `git push origin HEAD:main` et deux workflows de
      musique poussent vers `${GITHUB_REF_NAME}` (qui peut désigner `main`).
      Les conserver fonctionnels tant que leur mode de livraison n'est pas
      remplacé et vérifié.
- [ ] Migrer ces workflows de génération vers des branches de résultat et une
      intégration contrôlée, sans interrompre les publications audio.
- [x] Centraliser la préparation des modèles pour Pages et Chrome dans
      `scripts/prepare-runtime-assets.sh`, avec les mêmes vérifications.
- [x] Préparer et tester les assets une seule fois par exécution QA, puis les
      partager aux trois jobs Chrome via un artifact éphémère.
- [x] Stocker une version des modèles déjà préparés dans une GitHub Release
      immuable, avec SHA-256, et faire utiliser la même version à Pages et à QA.
- [x] Documenter l'ajout d'assets légers ou générés dans `assets/README.md`
      et installer le workflow manuel de reconstruction versionnée. La version
      courante v1 passe Pages et les trois scénarios Chrome.
- [ ] Mettre en place un chemin d'ajout/mise à jour : sources épinglées,
      reconstruction occasionnelle, validation Chrome puis publication v2/v3
      et actualisation du verrou sans PR. Le code du workflow existe ; son
      premier parcours complet avec une nouvelle version reste à vérifier.
- [ ] Ajouter un manifeste de dépendances avec versions et fichier de verrouillage
      pour reproduire le build localement et en CI.

## 2. Séparer le cœur de la simulation

- [ ] Définir les contrats `Unit`, `Building`, `GameState`, `Order`, `Resources`
      (JSDoc + `checkJs` ou TypeScript progressif, sans migration globale forcée).
- [ ] Regrouper l'état mutable d'une partie dans un contexte explicite ; limiter
      les variables libres partagées par des dizaines de fonctions.
- [ ] Isoler les commandes (`move`, `attack`, `repair`, `build`, `harvest`, etc.)
      derrière des fonctions de domaine réutilisables et testables.
- [x] Extraire les commandes `move` et `attack` dans `rts-orders.js`, avec
      annulation des raids et des tâches, sans dépendance DOM/Three.js.
      Tests Node et Chrome verts (run 42257656954).
- [ ] Faire passer `repair`, `build`, `harvest` et les autres ordres dans ce
      service, puis cocher l'isolation complète des commandes ci-dessus.
- [x] Extraire et valider les ordres d'ouvriers `repair`, `mine`, `collectWood`,
      `chop`, `harvest` dans `rts-orders.js` avec des tests Node et Chrome
      (run 42261206611). La construction et les activités automatiques restent.
- [x] Extraire l'ordonnancement `stepGame(dt)` dans `rts-simulation.js` :
      phases nommées, ordre conservé, pas fixe de 1/60 s et rattrapage borné
      à douze ticks. Validé par tests Node et Chrome (run 42256932710).
- [ ] Extraire progressivement les systèmes de simulation eux-mêmes du
      script HTML derrière les interfaces de l'ordonnanceur.
- [ ] Sortir progressivement la logique des ouvriers, unités et bâtiments du
      script intégré à `docs/index.html`.
- [ ] Séparer la décision stratégique des deux IA de l'exécution des commandes.
- [ ] Valider en Chrome l'exécution des actions Orc/Sorcière extraite dans
      `rts-ai-commands.js` ; les directeurs restent responsables des décisions.

## 3. Rendu et interface

- [ ] Extraire la sélection, les gestes tactiles, la caméra et les commandes
      utilisateur dans des modules d'entrée distincts.
- [ ] Finir les gestes tactiles, la sélection d'unités et le contrôle caméra :
      les cinq sélecteurs spatiaux (unités, corbeaux, bâtiments, arbres et bois)
      sont désormais extraits dans `rts-picking.js` et testés sous Node.
- [ ] Valider le contrôleur de caméra `rts-camera.js` en Chrome après ses tests
      de déplacement et cadrage mobile/desktop.
- [ ] Extraire le HUD, les boutons de commandes et la mini-carte du moteur.
- [ ] Séparer le chargement/caching des GLB et sons de leur utilisation par les
      systèmes de rendu et d'animation.
- [x] Réduire `docs/index.html` à l'import map, au DOM et au démarrage de
      l'application (111 lignes). Le module `docs/game.js` a été déplacé à
      l'octet près, sans modification de gameplay ; QA Chrome et Pages verts
      (runs 42258497349 et 42258497356).
- [ ] Décomposer progressivement `docs/game.js` en composants/systèmes
      indépendants, au-delà du premier déplacement mécanique.
- [x] Extraire du script d'intégration le transport des modèles binaires
      (`rts-assets.js`) avec tests gzip, fallback et métriques ; couvert par
      la QA Chrome verte du run 42260838733. Le run précédent 42259828733
      avait échoué sur le démarrage de Chrome (aucune assertion de jeu).
- [x] Extraire le calcul des cibles cliquables de l'interface dans
      `rts-picking.js`, sans modifier les tolérances mobile/desktop,
      validé sous Chrome (run 42260838733).

## 4. Tests et validation

- [x] Répartir `scripts/browser-qa.mjs` en scénarios `visual`, `economy`,
      `combat`, `dome` et interaction tactile, avec un pilote Chrome partagé.
      Les tests tactiles restent exécutés par le groupe `visual`.
- [ ] Ajouter des tests ciblés pour chaque commande extraite du fichier HTML.
- [x] Isoler l'interface `window.__fightersQA` derrière le mode `?qa=1`,
      sans l'exposer aux parties normales ; QA Chrome vérifiée.
- [ ] Mesurer les temps de tests et les coûts GitHub Actions avant/après.
- [x] Faire une QA Chrome/WebGL complète après le premier lot : simulation
      et garde QA (run 42256932710 : visual, economy, combat verts).
- [x] Faire une QA Chrome/WebGL complète après le deuxième lot : ordres
      d'unités (run 42257656954 : visual, economy, combat verts).
- [x] Faire une QA Chrome/WebGL complète après le troisième lot : module
      `game.js` externe (run 42258497349 : visual, economy, combat verts).
- [x] Répéter la QA Chrome/WebGL complète après les extractions de ressources,
      sélection et tâches d'ouvriers (runs 42260838733 et 42261206611 ;
      visual, economy, combat verts).
- [ ] Valider une relance Chrome automatique si DevTools ne démarre pas :
      le scénario `economy` du run 42259828733 a échoué au démarrage du
      navigateur, pas sur le jeu ; relance unique intégrée dans le driver.
- [ ] Faire une QA Chrome/WebGL complète après les extractions caméra, IA et
      le durcissement du démarrage de Chrome.

## Définition de « terminé »

Une étape est cochée si son code est sur `main`, les vérifications associées
passent, et aucune fonctionnalité, qualité d'image, audio ou fluidité n'a été
réduite pour simplifier l'architecture.
