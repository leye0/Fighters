# Consignes de développement — Fighters

Lire `refactor.md` avant une modification d'architecture. Les fonctionnalités
et le rendu actuels sont des contraintes de non-régression.

## Périmètres

- `docs/index.html` : intégration et bootstrap historique ; éviter d'y ajouter
  de nouveaux systèmes complets. Extraire progressivement, sans gros rewrite.
- `docs/rts-*.js`, `docs/orc-strategy.js`, `docs/witch-strategy.js` : règles de
  domaine ; privilégier des fonctions pures, déterministes et testables sous Node.
- `docs/styles/` : présentation CSS ; ne doit pas modifier les règles du jeu.
- `scripts/test-*.mjs` : tests unitaires ; ajouter un test au système modifié.
- `scripts/browser-qa.mjs` : orchestration des scénarios Chrome/WebGL.
- `scripts/browser-qa/{visual,economy,combat,dome,touch}.mjs` : scénarios QA
  indépendants ; modifier le fichier du scénario concerné.
- `scripts/browser-qa/chrome-driver.mjs` : transport Chrome DevTools partagé ;
  coordonner ses changements puisqu'ils affectent tous les scénarios.
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
- Pour HTML, CSS, entrées, simulation et rendu : QA réelle dans
  `.github/workflows/browser-qa.yml` (`visual`, `economy`, `combat`).

Les scripts des modèles 3D et les licences sont des éléments de production ;
préserver les sources et les attributions existantes.
