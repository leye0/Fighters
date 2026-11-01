# Fighters 🥊

Un **beat’em up 3D à défilement latéral** pour navigateur, construit avec TypeScript, Three.js et Vite. Le parcours accepte les déplacements gauche/droite, en profondeur, les sauts, les plateformes à plusieurs hauteurs et plusieurs ennemis. La caméra suit l’héroïne sans la réorienter automatiquement vers l’ennemi.

## Jouer à la démo 3D

**[Fighters — Claudia ou Carla](https://www.streamlev.com/Fighters/site/beat-em-up.html)** (navigateur avec WebGL 2, paysage sur téléphone).

- **Héroïnes :** Claudia et Carla, deux vrais modèles 3D riggés sous CC BY, sélectionnables dans l’en-tête.
- **Ennemis :** deux instances du modèle masculin Realistic Man, avec leurs propres squelettes clonés.
- **Animations :** **86 clips CC0 différents par personnage**, dérivés de Quaternius Universal Animation Library 1 et 2, intégrés directement aux trois GLB sur leurs vrais squelettes.
- **Commandes :** WASD/flèches pour marcher ; Espace ou J pour sauter ; K pour descendre d’une plateforme traversable ; F (jab), G (cross), H (crochet) pour attaquer. Les boutons tactiles et une manette sont également pris en charge.
- **Objectif :** battre les deux adversaires masculins sans perdre ses 100 PV. Les coups touchent uniquement devant le personnage, à portée et hauteur/profondeur compatibles. Les adversaires attaquent également. La fin de manche affiche un bouton **Rejouer**.

**Statut honnête : démo de combat jouable, en réglage.** Les dégâts, fenêtres de touche et réactions sont réellement calculés à 60 Hz, mais leurs valeurs sont **provisoires** et les contacts des mains/pieds avec les trois morphologies n’ont pas encore été approuvés visuellement. Ce n’est ni le jeu complet ni un équilibrage définitif. Les décors sont techniques et le rendu mobile reste à mesurer.

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

La simulation de déplacements **et de combats** tourne à **60 Hz** et gouverne la gravité, l’orientation, les volumes de contact, les dégâts et les KO. Les mouvements squelettiques sont purement visuels ; aucun personnage ne possède de collision solide avec un autre. L’ancien moteur de duel 1v1 a été supprimé. Les modèles des trois personnages restent soumis à leurs obligations d’attribution CC BY ; les animations Quaternius citées sont CC0.

Tout changement est effectué **directement sur `main`**, sans branche intermédiaire.
