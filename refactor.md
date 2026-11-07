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
- [x] Migrer les huit workflows de publication vers des branches de résultat
      `automation-results/<workflow>/<run>-<tentative>` puis une intégration
      contrôlée dans `main`, sans PR ni force-push. Les deux workflows musicaux
      conservent leur branche de révision et évitent toute publication directe
      depuis `main`. Trois tests Git (succès, progression concurrente, conflit
      conservant les assets) et garde des dix workflows verts :
      run 42282115438 (`generated-results.yml`, 1 job vert).
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
- [x] Ajouter un manifeste de dépendances avec versions exactes et
      `package-lock.json` vérifié ; le build utilise désormais `npm ci` et
      le workflow `build-lock.yml` reconstruit le verrou au besoin.
      Run 42282712421 vert : résolution, test des intégrités et installation
      des dépendances en CI. Commit du verrou : 696738d.

## 2. Séparer le cœur de la simulation

- [x] Définir les contrats `Unit`, `Building`, `GameState`, `Order`, `Resources`
      en TypeScript progressif dans `docs/rts-contracts.d.ts`, sans migration
      globale forcée ni dépendance TypeScript au runtime.
- [x] Valider avec un compilateur TypeScript les contrats progressifs ajoutés
      dans `docs/rts-contracts.d.ts` ; `GameState` y décrit l'état cible et non
      encore une structure effectivement centralisée dans le moteur :
      run 42269109685, compilation stricte verte.
- [x] Vérifier l'exécution du workflow TypeScript strict indépendant
      `.github/workflows/contracts.yml`, sans télécharger de compilateur
      dans chaque QA WebGL ni modifier le runtime du jeu :
      run 42269109685, terminé en 11 secondes.
- [ ] Regrouper l'état mutable d'une partie dans un contexte explicite ; limiter
      les variables libres partagées par des dizaines de fonctions.
- [x] Centraliser les conteneurs d'unités, sélection, bâtiments, chantiers et
      mémoire ennemie dans `rts-world-state.js` sans changer les références ni
      l'ordre du reset ; tests Node et run 42283713354 : trois suites Chrome
      `visual`, `economy` et `combat` vertes.
- [x] Valider dans Chrome l'extraction d'or/bois dans `rts-match-state.js` :
      économie neuve à chaque partie, paiement, remboursement, mines et récoltes.
      Run 42266733318, trois scénarios verts.
- [x] Valider en Chrome l'ajout de la magie au propriétaire d'état de partie :
      domes, pluie de feu, soins, siphonnage et régénération, sans changer
      l'ordre des réinitialisations ni les coûts :
      run 42268355424, trois scénarios verts.
- [x] Isoler les commandes principales (`move`, `attack`, `stop`, `repair`,
      `build`, `mine`, `harvest`, production) derrière les fonctions de domaine
      testables de `rts-orders.js`. Les actions spécialisées (ralliement,
      corbeaux, sorts) restent à découpler davantage.
- [x] Extraire les commandes `move` et `attack` dans `rts-orders.js`, avec
      annulation des raids et des tâches, sans dépendance DOM/Three.js.
      Tests Node et Chrome verts (run 42257656954).
- [x] Valider dans Chrome l'ordre `stop` extrait dans `rts-orders.js`,
      qui conserve la séquence des nettoyages de tâches sans modifier les
      états de défense ou de raid non concernés par l'arrêt :
      run 42267811356, trois scénarios verts.
- [x] Faire passer `repair`, `build`, `harvest`, `mine`, `collectWood`, `chop`,
      `stop` et la production dans les services `rts-orders.js` ; les actions
      spécialisées de ralliement, de corbeaux et de magie restent dans leurs
      adaptateurs/règles propres et sont suivies avec le reste du moteur.
- [x] Valider dans Chrome l'assignation de construction déplacée dans
      `rts-orders.js` (ouvrier préféré, paiement, remise à zéro des ressources) :
      run 42262989882, trois scénarios verts.
- [x] Valider sous Chrome les files de formation et d'amélioration, sorties
      dans `rts-orders.js` avec coûts, annulations et remboursements testés :
      run 42265500682, trois scénarios verts.
- [x] Valider la progression de production extraite dans `rts-orders.js`
      (durées, avancement résiduel, un ordre terminé au maximum par tick) :
      run 42266733318, trois scénarios verts.
- [x] Extraire et valider les ordres d'ouvriers `repair`, `mine`, `collectWood`,
      `chop`, `harvest` dans `rts-orders.js` avec des tests Node et Chrome
      (run 42261206611). La construction et les activités automatiques restent.
- [x] Extraire l'ordonnancement `stepGame(dt)` dans `rts-simulation.js` :
      phases nommées, ordre conservé, pas fixe de 1/60 s et rattrapage borné
      à douze ticks. Validé par tests Node et Chrome (run 42256932710).
- [x] Valider dans Chrome `rts-unit-tick.js` : logique d'attaque, poursuite,
      défense de groupe et priorité des tâches d'ouvrier extraite de
      `game.js`. Les 4 956 caractères de logique normalisés sont identiques
      avant/après l'extraction ; tests Node et garde d'architecture verts.
      Run 42276399265 : visual, economy et combat verts.
- [ ] Extraire progressivement les systèmes de simulation eux-mêmes du
      script HTML derrière les interfaces de l'ordonnanceur.
- [ ] Sortir progressivement la logique des ouvriers, unités et bâtiments du
      script intégré à `docs/index.html`.
- [x] Extraire la poursuite, la capture, l'interruption et la consommation des
      proies orcs dans `rts-orc-forager.js` ; tests Node et run 42284582091 :
      Chrome `visual`, `economy` et `combat` verts.
- [x] Extraire la décision d'attribution des chasses orcs (cadavre/lièvre,
      brouillard, chemins et priorité des combats) dans
      `rts-orc-hunt-planner.js` ; cadence et reset testés sous Node,
      run 42286031105 : Chrome `visual`, `economy`, `combat` verts.
- [x] Sortir les pas alimentaires orcs/sorcières de `game.js` dans
      `rts-food-cycle.js` (ordre d'exécution, cueillette, famine, dégâts,
      alertes et reset) ; tests Node et run 42286451348 : Chrome
      `visual`, `economy`, `combat` verts.
- [x] Isoler la diversion des combattants orcs par les corbeaux dans
      `rts-raven-distraction.js` (vue réelle, durée, poursuite sans attaque,
      cooldown et disparition) ; tests Node et run 42286833419 :
      Chrome `visual`, `economy`, `combat` verts.
- [x] Extraire les soins des sorcières et la retraite automatique vers les
      cercles dans `rts-healing-cycle.js` (magie réellement consommée, budget
      partagé, sécurité, interruption et cadence) ; tests Node et
      run 42287409698 : Chrome `visual`, `economy`, `combat` verts.
- [x] Isoler l'attribution et l'exécution des récoltes d'âmes des mages dans
      `rts-soul-harvester.js` (cadavres visibles, réservations, chemins,
      interruption, animation `Death01` et reset). Tests Node et QA Chrome
      `visual`, `economy`, `combat` verts : run 42303519140.
- [x] Extraire l'attribution automatique des mineurs et le cycle extraction/transport
      dans `rts-mining-cycle.js` : brouillard de guerre, annulation, navigation,
      pioche, cargaison et paiement seulement à la livraison ; ressources
      courantes après reset. Tests Node et QA Chrome `visual`, `economy`,
      `combat` verts : run 42303519140.
- [x] Extraire le cycle du bois dans `rts-wood-cycle.js` : choix des arbres
      visibles et sûrs, affectation automatique orc/sorcière, coupe, réservation
      des bûches, ramassage, restitution après interruption et livraison sans
      crédit anticipé. Tests Node et QA Chrome `visual`, `economy`, `combat`
      verts : run 42312604304 ; publication Pages également verte.
- [x] Extraire le cycle des jardinières dans `rts-garden-worker-cycle.js` :
      attribution automatique cadencée, réservations de plants mûrs, récolte
      physique avec animation et son, transport jusqu'à une maison de sorcières,
      paiement à la livraison, interruptions, trajets bloqués et reset.
      Tests Node et QA Chrome `visual`, `economy`, `combat` verts :
      run 42320598280 ; Pages vert : run 42320598368.
- [x] Extraire la cueillette des baies sauvages dans
      `rts-berry-forager-cycle.js` : cadence de 850 ms, deux cueilleuses au
      maximum, portée de 3 unités, vigilance des combattantes, navigation,
      interruptions, consommation sur place pendant 1,6 seconde et reset.
      Tests Node et QA Chrome `visual`, `economy`, `combat` verts :
      run 42321954353 ; Pages vert : run 42321954323.
- [x] Séparer la décision stratégique des deux IA de l'exécution des commandes :
      directeurs `*-strategy.js`, exécution `rts-ai-commands.js`.
- [x] Valider en Chrome l'exécution des actions Orc/Sorcière extraite dans
      `rts-ai-commands.js` ; run 42262289649, trois scénarios verts.
- [x] Extraire les observations des deux IA dans `rts-ai-observations.js`,
      conserver les filtres de visibilité (zones explorées côté orcs,
      visibilité actuelle côté sorcières) ; tests Node et run 42280385272
      Chrome/WebGL `visual`, `economy`, `combat` verts.

## 3. Rendu et interface

- [x] Extraire la sélection, les gestes tactiles, la caméra et la politique
      des clics utilisateur dans `rts-picking.js`, `rts-gestures.js`,
      `rts-camera.js` et `rts-player-actions.js` ; les boutons HUD restent
      assemblés par `game.js`.
- [x] Valider en Chrome la politique des clics extraite dans
      `rts-player-actions.js` : priorité d'attaque des maisons sur les
      silhouettes, réparation, exploitation, modes construction, corbeaux,
      sélection de groupe et clic vide sans changement de gameplay :
      run 42267437749, trois scénarios verts.
- [x] Extraire les mécanismes de gestes, de sélection spatiale et de caméra :
      `rts-gestures.js`, `rts-picking.js` (cinq types de cibles) et
      `rts-camera.js` ; le choix des ordres après un clic reste dans `game.js`.
- [x] Valider sous Chrome la machine à gestes `rts-gestures.js` (tap, pan,
      sélection à deux doigts, relâchement décalé, souris et anti-double tap),
      extraite sans changer les seuils originaux ni la politique des ordres :
      run 42265998752, trois scénarios verts.
- [x] Valider le contrôleur de caméra `rts-camera.js` en Chrome après ses tests
      de déplacement et cadrage mobile/desktop : run 42262289649.
- [x] Extraire le HUD (ressources, boutons, barres de santé) et la mini-carte
      dans `rts-hud.js` et `rts-minimap.js`. Les décisions sur les boutons et
      les entrées restent dans `game.js` en attente d'autres extractions.
- [x] Valider sous Chrome le moteur DOM `rts-hud.js` (ressources, boutons,
      barres de santé) : run 42264828100, trois scénarios verts.
- [x] Valider sous Chrome l'extraction du dessin de mini-carte dans
      `rts-minimap.js` : cache de brouillard 112×112, visibilité distincte des
      corbeaux, bâtiments et unités, cadrage caméra inchangés :
      run 42264465440, trois scénarios verts.
- [x] Séparer le chargement/caching des GLB et sons de leur utilisation par les
      systèmes de rendu et d'animation. Les voix/effets utilisent déjà
      `rts-sound.js`/`rts-effects.js` (AudioContext, téléchargements et caches
      autonomes) ; les GLB utilisent maintenant `rts-model-assets.js`.
- [x] Valider dans Chrome l'extraction du chargeur GLTF/Meshopt, du parsing
      binaire et du cache de modèles de niveaux dans `rts-model-assets.js` ;
      tests Node ajoutés, scènes non partagées toujours chargées séparément.
      Run 42277316420 : visual, economy et combat verts.
- [x] Réduire `docs/index.html` à l'import map, au DOM et au démarrage de
      l'application (111 lignes initiales, puis includes des nouveaux modules).
      Le module `docs/game.js` a été déplacé à
      l'octet près, sans modification de gameplay ; QA Chrome et Pages verts
      (runs 42258497349 et 42258497356).
- [x] Commencer la décomposition effective de `docs/game.js` en composants
      testables indépendants (simulation, commandes, gestes, sélection,
      mini-carte, HUD, caméra, IA, assets, ressources). La poursuite du
      découpage des ticks reste suivie dans la section 2.
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
- [x] Ajouter des tests ciblés pour chaque commande extraite du fichier HTML :
      déplacements/attaques/arrêt, tâches d'ouvriers, construction, production,
      gestes tactiles et politique de ciblage ; exécutés dans la QA Chrome.
- [x] Isoler l'interface `window.__fightersQA` derrière le mode `?qa=1`,
      sans l'exposer aux parties normales ; QA Chrome vérifiée.
- [x] Relever les durées historiques et récentes de la QA Chrome/WebGL,
      calculer moyenne et médiane, vérifier le coût des runners Ubuntu standard
      sur dépôt public et consigner limites et sources dans `docs/ci-metrics.md`.
- [x] Décrire les frontières de modules, propriétaires de fichiers, contrats,
      invariants de simulation et règles d'intégration dans `docs/architecture.md`.
- [x] Exécuter sous CI un garde-fou d'architecture pour empêcher les
      réintroductions de code métier dans le HTML, les scripts manquants,
      les dépendances inversées, les zones sans propriétaire et les rebuilds
      géants à chaque changement de code : test Node et étape de préparation
      du run 42268791614 verts ; les trois scénarios Chrome (visual, economy,
      combat) ont également terminé avec succès.
- [x] Faire une QA Chrome/WebGL complète après le premier lot : simulation
      et garde QA (run 42256932710 : visual, economy, combat verts).
- [x] Faire une QA Chrome/WebGL complète après le deuxième lot : ordres
      d'unités (run 42257656954 : visual, economy, combat verts).
- [x] Faire une QA Chrome/WebGL complète après le troisième lot : module
      `game.js` externe (run 42258497349 : visual, economy, combat verts).
- [x] Répéter la QA Chrome/WebGL complète après les extractions de ressources,
      sélection et tâches d'ouvriers (runs 42260838733 et 42261206611 ;
      visual, economy, combat verts).
- [x] Valider une relance Chrome automatique si DevTools ne démarre pas :
      le scénario `economy` du run 42259828733 a échoué au démarrage du
      navigateur, pas sur le jeu ; relance unique intégrée dans le driver.
      La politique de retry simulée est testée sous Node sur `main`
      (commit add7089) : échec initial, succès à la deuxième tentative,
      échec terminal et nettoyage. Le workflow dédié `chrome-retry.yml`
      tue volontairement le premier lancement puis vérifie la reconnexion
      DevTools sur un vrai Chrome : run 42278421772 vert en 23 secondes.
      La QA WebGL complète après ce changement est aussi verte :
      run 42278421711 (visual, economy, combat).
- [x] Faire une QA Chrome/WebGL complète après les extractions caméra, IA et
      le durcissement du démarrage de Chrome : run 42262289649,
      visual/economy/combat verts (le retry réel a ensuite été vérifié ci-dessus).

## Définition de « terminé »

Une étape est cochée si son code est sur `main`, les vérifications associées
passent, et aucune fonctionnalité, qualité d'image, audio ou fluidité n'a été
réduite pour simplifier l'architecture.
