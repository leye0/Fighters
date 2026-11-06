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
   `rts-ai-commands.js` interprète ces intentions avec les mêmes opérations de
   monde que le joueur, sans participer à leur décision.

## Ownership recommandé pour plusieurs agents

| Système | Fichiers principaux | Vérification ciblée |
|---|---|---|
| Simulation et déplacements | `rts-simulation.js`, `rts-unit-physics.js`, `rts-navigation.js` | `test-rts-simulation.mjs`, `test-rts-unit-physics.mjs`, `test-rts-navigation.mjs` |
| État de partie | `rts-match-state.js` (or, bois et magie), `game.js` (état restant, transitoire) | `test-rts-match-state.mjs`, Chrome `economy`, `combat` |
| Ordres et tâches | `rts-orders.js`, règles `rts-repair.js`, `rts-farming.js` | `test-rts-orders.mjs`, `test-rts-worker-orders.mjs`, `test-rts-construction-orders.mjs`, `test-rts-production-orders.mjs` |
| IA | `orc-strategy.js`, `witch-strategy.js`, `rts-ai-commands.js` | `test-orc-strategy.mjs`, `test-witch-strategy.mjs`, `test-rts-ai-commands.mjs` |
| Commandes joueur | `rts-picking.js`, `rts-camera.js`, `rts-gestures.js`, `rts-player-actions.js` | `test-rts-picking.mjs`, `test-rts-camera.mjs`, `test-rts-gestures.mjs`, `test-rts-player-actions.mjs`, QA Chrome tactile |
| Modèles et ressources | `rts-assets.js`, `assets/runtime-assets.lock`, `scripts/use-pinned-runtime-assets.sh` | `test-rts-assets.mjs`, QA Chrome, Pages |
| Monde et visibilité | `rts-map.js`, `rts-footprint.js`, `rts-fog.js`, `rts-forest.js` | `test-rts-map.mjs`, `test-rts-footprint.mjs`, `test-rts-fog.mjs`, `test-rts-forest.mjs` |
| Présentation | `styles/game.css`, `rts-minimap.js`, `rts-hud.js`, `game.js` (composition HUD/rendu) | `test-rts-minimap.mjs`, `test-rts-hud.mjs`, Chrome `visual`, `economy`, `combat` |
| Validation navigateur | `scripts/browser-qa/` par scénario, `chrome-driver.mjs` commun | Workflow `browser-qa.yml` |
| Architecture et intégration | `index.html`, `AGENTS.md`, `architecture.md`, `browser-qa.yml` | `test-rts-architecture.mjs` (frontières, includes, ownership et CI) |
| Contrats de domaine | `rts-contracts.d.ts`, `scripts/contracts-smoke.ts` | `contracts.yml` avec compilateur TypeScript strict (sur modification seulement) |

Un agent peut modifier un module isolé et son test sans toucher au code de
présentation. Si une intégration dans `game.js` est nécessaire, un seul agent
en est propriétaire pour la durée de la modification. Toute mise à jour de
`main` doit revérifier le dernier commit distant et éviter les écritures en
concurrence (voir `AGENTS.md`).

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
- Les états `witch`/`orc` des unités ne sont pas synonymes des `clanId`
  `witch`/`orcs`/`neutral` des bâtiments.
- La simulation demeure à **60 ticks/seconde** avec au plus 12 ticks de
  rattrapage par image. L'ordre des phases de `stepGame` est un contrat.
- Ne pas créer de géométrie, matériau, son, tableau volumineux ou élément DOM
  inutile par tick. Un refactor ne doit changer ni sélection tactile, ni
  formes de collision, ni déplacements, ni musique.
- Ne pas assimiler tous les « assets » à des fichiers téléchargés à chaque
  publication : `assets/runtime-assets.lock` pointe vers un paquet préfabriqué
  et vérifié, et sa reconstruction est une opération manuelle occasionnelle.

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
