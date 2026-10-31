# Fighters 🥊

Un **beat’em up 3D à défilement latéral** pour navigateur, construit avec TypeScript, Three.js et Vite. Le parcours accepte les déplacements gauche/droite, en profondeur, les sauts, les plateformes à plusieurs hauteurs et plusieurs ennemis. La caméra suit l’héroïne sans la réorienter automatiquement vers l’ennemi.

## Jouer à la scène 3D

**[Fighters — Claudia ou Carla](https://www.streamlev.com/Fighters/site/beat-em-up.html)** (navigateur avec WebGL 2, paysage sur téléphone).

- **Héroïnes :** Claudia et Carla, deux vrais modèles 3D riggés sous CC BY, sélectionnables dans l’en-tête.
- **Ennemis :** deux instances du modèle masculin Realistic Man, avec leurs propres squelettes clonés.
- **Animations :** **86 clips CC0 différents par personnage**, dérivés de Quaternius Universal Animation Library 1 et 2, intégrés directement aux trois GLB sur leurs vrais squelettes.
- **Commandes :** WASD/flèches pour marcher ; Espace ou J pour sauter ; K pour descendre d’une plateforme traversable ; F, G et H pour voir trois véritables gestes de combat. Les boutons tactiles et une manette sont également pris en charge.

Les coups F/G/H sont **des démonstrations de gestes animés** : dégâts et contacts ne sont pas encore synchronisés et approuvés. Le jeu complet, les combats validés et les décors finaux restent à construire ; ne pas confondre la scène jouable de navigation avec le jeu final.

## Démarrage local

Node.js 24 ou supérieur :

```bash
npm ci
npm run dev
```

Ouvrir `http://127.0.0.1:5173/beat-em-up.html`. Pour vérifier la compilation et les tests :

```bash
npm test
npm run build
npm run animation:verify
```

`animation:verify` nécessite les trois GLB générés par le workflow de publication. La construction automatisée est détaillée dans [docs/quaternius-pipeline.md](docs/quaternius-pipeline.md). Le premier téléchargement des sources CC0 est requis **sur la machine de compilation uniquement** ; jouer ensuite aux animations ne requiert **aucun compte, aucune connexion à un service d’animation et aucune action manuelle**. Le site Web a évidemment besoin d’un chargement initial de ses fichiers.

## Projet

- [Plan de production vivant](docs/production-plan.md)
- [Architecture du beat’em up](docs/beat-em-up-architecture.md)
- [Animations CC0 et provenance](docs/quaternius-pipeline.md)
- [Politique des attaques animation-first](docs/animation-first.md)
- [Registre et attribution des personnages](docs/asset-register.md)
- [QA visuelle](docs/visual-qa.md)

La simulation de déplacements tourne à **60 Hz** et gouverne les collisions, la gravité et l’orientation. Les mouvements squelettiques sont purement visuels. Les modèles des trois personnages restent soumis à leurs obligations d’attribution CC BY ; les animations Quaternius citées sont CC0.

Tout changement est effectué **directement sur `main`**, sans branche intermédiaire.
