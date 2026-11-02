# Fighters — prototype RTS sorcières contre orcs

[**Jouer dans le navigateur**](https://www.streamlev.com/Fighters/) · [**Laboratoire des animations**](https://www.streamlev.com/Fighters/motion-lab.html)

Fighters est maintenant un **prototype de stratégie en temps réel (RTS)** sur une carte 3D isométrique. Le système de beat ’em up, son joystick virtuel, ses gestes de combat, ses vagues et son contrôle direct des personnages ont été remplacés par des ordres d'unité et un système de production/construction.

## Comment jouer

- **Sorcières (faction initiale)** : toucher ou cliquer sur une sorcière pour la sélectionner; toucher le sol pour lui ordonner de marcher vers cet endroit.
- **Groupe** : glisser pour dessiner un rectangle autour de plusieurs unités (souris ou écran tactile), puis toucher un emplacement pour déplacer le groupe en formation. **Ctrl/Cmd+A** sélectionne les unités de la faction active; **Maj+clic** permet d'ajouter/retirer des unités.
- **Maison des sorcières** : la sélectionner pour afficher le bouton « Entraîner une sorcière ». Chaque entraînement coûte **120 pièces d'or** et prend **3,5 secondes**. Les commandes s'accumulent dans une **file d'attente**. Solde initial : **2 000 pièces d'or**.
- **Orcs** : sélectionner la faction avec le bouton ⚔ en haut, puis choisir une construction dans le panneau de commandes. Toucher un emplacement libre de la **moitié est** de la carte pour poser un bâtiment. Cinq modèles niveau 1 disponibles : **caserne, hutte, mine, chaudron et atelier**, plus les cinq bâtiments présents au départ. Solde initial : **900 pièces d'or**. Les bâtiments ont une empreinte, des points de vie, un coût et un identifiant unique.
- **Combat** : les deux types d'unités utilisent une IA d'engagement automatique à proximité et les véritables clips d'attaque, de marche, d'impact et de mort. Les orcs défendent leur zone; les sorcières suivent leurs ordres de déplacement et engagent les adversaires proches.
- **Pause** : bouton Ⅱ ou touche **P**. **Échap** annule une construction. Les boutons 🧙 et ⚔ changent la faction contrôlée.

Aucun gisement de ressources n'est placé sur le territoire des sorcières à ce stade. Les coûts, les timings et les points de vie sont provisoires. Le prototype ne comporte pas encore de système de récolte, de recherche technologique, de navigation autour des bâtiments, de victoire/défaite de faction ni de véritable économie asymétrique.

## Modèles et animation

Le projet conserve le **rig Quaternius de 65 os**, les GLB homme/femme et les **86 animations natives** des personnages, les costumes et coiffures skinnés sur leur squelette original, et les épées montées sur l'os de la main par leur poignée calibrée. Pas de retargeting vers un squelette étranger.

Le vrai modèle `witch_house.glb` est utilisé pour la maison des sorcières. Les bâtiments orcs sont extraits des deux morceaux du GLB d'origine lors du déploiement par `scripts/split-orc-buildings.mjs`; le niveau 1 de chaque type est instancié dans le village et sert de prototype pour construire de nouveaux bâtiments, avec conservation des animations propres aux modèles.

Le laboratoire `docs/motion-lab.html` est indépendant et reste accessible pour contrôler les animations sources.

## Vérification

- La page expose `window.__fightersQA` pour les tests de régression, notamment `snapshot()`, `train()`, `selectWitches()`, `move(x,z)`, `beginBuild(type)`, `build(type,x,z)`, `advance(seconds)` et `reset()`.
- `scripts/browser-qa.mjs` utilise **Chrome réel + WebGL SwiftShader**, vérifie le chargement des deux factions et des cinq plans, la file d'entraînement, les déplacements de groupe, la construction et ses collisions, l'argent, la pause et la réinitialisation.
- `.github/workflows/browser-qa.yml` prépare les modèles via la même extraction que le déploiement Pages, puis exécute la suite.
- `.github/workflows/pages.yml` produit les assets complets dans GitHub Pages : ne pas ouvrir `docs/index.html` en `file://`.

Le jeu doit être servi par HTTP avec tous les assets générés. Le workflow Pages publie sur le site de démonstration indiqué ci-dessus.
