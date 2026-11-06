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
- [ ] Extraire l'ordonnancement `stepGame(dt)` et les systèmes de simulation
      derrière des interfaces explicites, en conservant le pas fixe de 1/60 s.
- [ ] Sortir progressivement la logique des ouvriers, unités et bâtiments du
      script intégré à `docs/index.html`.
- [ ] Séparer la décision stratégique des deux IA de l'exécution des commandes.

## 3. Rendu et interface

- [ ] Extraire la sélection, les gestes tactiles, la caméra et les commandes
      utilisateur dans des modules d'entrée distincts.
- [ ] Extraire le HUD, les boutons de commandes et la mini-carte du moteur.
- [ ] Séparer le chargement/caching des GLB et sons de leur utilisation par les
      systèmes de rendu et d'animation.
- [ ] Réduire `docs/index.html` à l'assemblage des systèmes, au DOM et au
      démarrage de l'application.

## 4. Tests et validation

- [x] Répartir `scripts/browser-qa.mjs` en scénarios `visual`, `economy`,
      `combat`, `dome` et interaction tactile, avec un pilote Chrome partagé.
      Les tests tactiles restent exécutés par le groupe `visual`.
- [ ] Ajouter des tests ciblés pour chaque commande extraite du fichier HTML.
- [ ] Isoler les contrôles `window.__fightersQA` derrière le mode QA et une
      interface de test explicite.
- [ ] Mesurer les temps de tests et les coûts GitHub Actions avant/après.
- [ ] Faire une QA Chrome/WebGL complète après chaque lot d'extractions.

## Définition de « terminé »

Une étape est cochée si son code est sur `main`, les vérifications associées
passent, et aucune fonctionnalité, qualité d'image, audio ou fluidité n'a été
réduite pour simplifier l'architecture.
