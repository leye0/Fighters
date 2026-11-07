# Architecture du RTS Fighters

Ce document décrit les frontières de code et les responsabilités **réelles** du
jeu après les premières extractions. Le suivi des travaux restant à faire est
dans [`../refactor.md`](../refactor.md).

## Démarrage et direction des dépendances

1. `index.html` fournit les éléments HTML, l'import map et charge les modules
   classiques `rts-*.js` dans l'ordre, avant `game.js` (module ES).
2. `game.js` est le **composition root** transitoire : Three.js, état vivant,
   création/destruction des objets 3D, événements et liaison des services.
3. Les modules `rts-*.js` ne doivent pas dépendre de `game.js` ni lire son état
   global ; leur fabrique reçoit des fonctions/objets explicitement injectés.
4. Les directeurs `orc-strategy.js` et `witch-strategy.js` prennent des
   observations filtrées par le brouillard de guerre et rendent des intentions.
   `rts-ai-observations.js` construit ces observations sans leur donner le
   monde vivant ; `rts-ai-commands.js` interprète les intentions avec les mêmes opérations de
   monde que le joueur, sans participer à leur décision.

## Ownership recommandé pour plusieurs agents

| Système | Fichiers principaux | Vérification ciblée |
|---|---|---|
| Simulation et déplacements | `rts-simulation.js`, `rts-food-cycle.js`, `rts-raven-distraction.js`, `rts-healing-cycle.js`, `rts-soul-harvester.js`, `rts-unit-tick.js`, `rts-unit-physics.js`, `rts-navigation.js` | `test-rts-simulation.mjs`, `test-rts-food-cycle.mjs`, `test-rts-raven-distraction.mjs`, `test-rts-healing-cycle.mjs`, `test-rts-soul-harvester.mjs`, `test-rts-unit-tick.mjs`, `test-rts-unit-physics.mjs`, `test-rts-navigation.mjs` |
| État de partie | `rts-match-state.js` (or, bois et magie), `rts-world-state.js` (collections d'entités), `game.js` (scalaires restants, transitoire) | `test-rts-match-state.mjs`, `test-rts-world-state.mjs`, Chrome `economy`, `combat` |
| Ordres et tâches | `rts-orders.js`, `rts-mining-cycle.js`, `rts-wood-cycle.js`, `rts-garden-worker-cycle.js`, `rts-orc-forager.js`, `rts-orc-hunt-planner.js`, règles `rts-repair.js`, `rts-farming.js` | `test-rts-orders.mjs`, `test-rts-mining-cycle.mjs`, `test-rts-wood-cycle.mjs`, `test-rts-garden-worker-cycle.mjs`, `test-rts-worker-orders.mjs`, `test-rts-orc-forager.mjs`, `test-rts-orc-hunt-planner.mjs`, `test-rts-construction-orders.mjs`, `test-rts-production-orders.mjs` |
| IA | `orc-strategy.js`, `witch-strategy.js`, `rts-ai-observations.js`, `rts-ai-commands.js` | `test-orc-strategy.mjs`, `test-witch-strategy.mjs`, `test-rts-ai-observations.mjs`, `test-rts-ai-commands.mjs` |
| Commandes joueur | `rts-picking.js`, `rts-camera.js`, `rts-gestures.js`, `rts-player-actions.js` | `test-rts-picking.mjs`, `test-rts-camera.mjs`, `test-rts-gestures.mjs`, `test-rts-player-actions.mjs`, QA Chrome tactile |
| Modèles et ressources | `rts-assets.js`, `rts-model-assets.js`, `assets/runtime-assets.lock`, `package.json`, `package-lock.json`, `scripts/use-pinned-runtime-assets.sh` | `test-rts-assets.mjs`, `test-rts-model-assets.mjs`, `test-runtime-build-manifest.mjs`, QA Chrome, Pages |
| Monde et visibilité | `rts-map.js`, `rts-footprint.js`, `rts-fog.js`, `rts-forest.js` | `test-rts-map.mjs`, `test-rts-footprint.mjs`, `test-rts-fog.mjs`, `test-rts-forest.mjs` |
| Présentation | `styles/game.css`, `rts-minimap.js`, `rts-hud.js`, `game.js` (composition HUD/rendu) | `test-rts-minimap.mjs`, `test-rts-hud.mjs`, Chrome `visual`, `economy`, `combat` |
| Validation navigateur | `scripts/browser-qa/` par scénario, `chrome-driver.mjs` commun | Workflows `browser-qa.yml` et `chrome-retry.yml` (relance réelle ciblée) |
| Architecture et intégration | `index.html`, `AGENTS.md`, `architecture.md`, `browser-qa.yml`, `publish-generated-result.sh` | `test-rts-architecture.mjs` (frontières, includes, ownership et CI), `test-generated-result-publish.mjs`, workflow `generated-results.yml` |
| Contrats de domaine | `rts-contracts.d.ts`, `scripts/contracts-smoke.ts` | `contracts.yml` avec compilateur TypeScript strict (sur modification seulement) |

Un agent peut modifier un module isolé et son test sans toucher au code de
présentation. Si une intégration dans `game.js` est nécessaire, un seul agent
en est propriétaire pour la durée de la modification. Toute mise à jour de
`main` doit revérifier le dernier commit distant et éviter les écritures en
concurrence (voir `AGENTS.md`).

Les anciens workflows de génération conservent maintenant un commit source dans
`automation-results/<workflow>/<run>-<tentative>` **avant** toute tentative
de publication. L'intégration reconstruit un commit sur la tête courante de
`main` ; en cas de conflit ou de concurrence irréconciliable, elle échoue sans
écraser les changements existants, et le résultat reste récupérable. Aucun
workflow audio n'est déclenché par le test de cette politique. Les générations
musicales destinées à révision restent sur leurs branches propres ; une
invocation manuelle sur `main` n'y publie aucun MP3 directement.
Les anciens jobs de génération ponctuelle conservent `workflow_dispatch`, mais
leur YAML modifié ne déclenche plus de régénération automatique potentiellement
payante. Les imports de médias libres gardent leurs déclencheurs sur les
scripts d'import effectifs.
Le build *exceptionnel* des modèles/Three.js utilise `npm ci` avec versions
transitives et intégrités enregistrées dans `package-lock.json` ; l'étape
`build-lock.yml` est réservée à la génération/validation de ce verrou.
Le démarrage normal de Pages ou Chrome ne fait jamais `npm ci`.

## Contrats et règles de cohérence

- Les types de domaine de référence se trouvent dans `rts-contracts.d.ts`.
  `GameState` y est la **cible** de migration, pas encore un objet global
  déjà implémenté. Les fonctions extraites reçoivent leurs dépendances en
  arguments, et les ressources remplacées lors du reset doivent être lues via
  des fonctions (`getGold`, `getWood`) plutôt que capturées une fois au boot.
- Le propriétaire `rts-match-state.js` réinitialise l'or, le bois et la magie
  par nouveau match. `resetMagic` reste appelé au moment historique du reset
  des esprits et `resetEconomy` au moment historique des chantiers ; la
  migration des autres variables d'état reste progressive.
  Les files de production et les chantiers utilisent `getGold()` et `getWood()`
  au moment de la commande afin de respecter le remplacement des ressources
  lors du démarrage d'une nouvelle partie. Les boutons n'appellent que le
  service de domaine et rafraîchissent ensuite le HUD.
- `rts-world-state.js` possède les collections stables des unités, de la
  sélection, des bâtiments, des chantiers et des souvenirs ennemis par clan.
  `game.js` conserve temporairement des alias vers ces collections ; elles
  doivent être vidées **après** la libération des objets 3D/DOM, au moment
  historique exact de la réinitialisation. Les autres variables mutables sont
  encore progressivement à migrer vers un contexte explicite.
- `rts-mining-cycle.js` détient le choix automatique des mineurs, les phases
  `extract`/`carry` et l'annulation. Le transport d'or n'est payé qu'à la base ;
  le crédit de la nouvelle partie, les compteurs et les visuels 3D sont adaptés
  par `game.js` sans capturer un ancien objet de ressources.
- `rts-wood-cycle.js` possède l'attribution des coupes, les phases de ramassage
  et la livraison ; une cargaison interrompue redevient un dépôt réservable.
  La direction d'IA, les seuils de bois et le brouillard sont lus au moment
  de la décision, tandis que `game.js` conserve les scènes et les effets.
- `rts-garden-worker-cycle.js` attribue les jardinières chaque 750 ms, choisit
  un rang mûr non réservé, récolte pendant 1,6 seconde et crédite la nourriture
  uniquement au retour à une maison de sorcières ; `game.js` conserve le blé 3D.
- Les états `witch`/`orc` des unités ne sont pas synonymes des `clanId`
  `witch`/`orcs`/`neutral` des bâtiments.
- La simulation demeure à **60 ticks/seconde** avec au plus 12 ticks de
  rattrapage par image. L'ordre des phases de `stepGame` est un contrat.
- `rts-unit-tick.js` possède désormais l'arbitrage des priorités d'une unité
  à chaque pas fixe. `game.js` lui injecte les systèmes concrets sans y
  reconstruire la décision de combat, de poursuite ou de tâches d'ouvrier.
- Ne pas créer de géométrie, matériau, son, tableau volumineux ou élément DOM
  inutile par tick. Un refactor ne doit changer ni sélection tactile, ni
  formes de collision, ni déplacements, ni musique.
- Ne pas assimiler tous les « assets » à des fichiers téléchargés à chaque
  publication : `assets/runtime-assets.lock` pointe vers un paquet préfabriqué
  et vérifié, et sa reconstruction est une opération manuelle occasionnelle.
- Le modèle GLB passe par `rts-model-assets.js` : un chargeur GLTF/Meshopt
  unique et un cache seulement pour les niveaux de bâtiments explicitement
  partagés. Les autres scènes doivent rester indépendantes pour permettre
  leurs propres mutations et animations.

## Validation et intégration

Avant de cocher une tâche : tests Node ciblés et de non-régression, vérification
syntaxique, `git diff --check`, puis QA WebGL Chrome et Pages pour tout code
chargé par le navigateur. La QA Browser est divisée en `visual`, `economy` et
`combat` pour que leurs tests soient attribuables à un système.

Les extractions encore souhaitées ne sont pas masquées : état de partie
entièrement centralisé, actions automatiques, politique de commandes du HUD,
décomposition des ticks des unités, verrouillage des
dépendances du build, migration des workflows historiques qui poussent sur
`main`, et essai complet de la reconstruction des assets v2.
