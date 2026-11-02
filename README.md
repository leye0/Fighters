# Fighters — prototype RTS sorcières contre orcs

[**Jouer au RTS**](https://www.streamlev.com/Fighters/) · [**Laboratoire des animations**](https://www.streamlev.com/Fighters/motion-lab.html)

Prototype de stratégie en temps réel sur une carte 3D isométrique. Les anciens contrôles directs du beat ’em up ont été supprimés : les personnages suivent maintenant des **ordres de sélection, déplacement et production**.

## Contrôles

- **Sélection :** clic/tap sur une sorcière, un orc ou le **modèle 3D d'un bâtiment**, y compris son toit. **Glisser** sur le terrain dessine une boîte de sélection de groupe, **Maj+clic** ajoute ou retire des unités, **Ctrl/Cmd+A** sélectionne toutes les unités de la faction.
- **Déplacement :** avec des unités sélectionnées, toucher/clicker le sol ordonne le déplacement en formation. Le combat s'enclenche automatiquement lorsque les ennemis sont proches. Les ordres explicites restent prioritaires face à l'aggro lointaine.
- **Caméra :** **molette** (ordinateur), **pincement à deux doigts** (téléphone/tablette), boutons **− / +** en haut de l'écran. **Deux doigts en translation** déplacent la caméra sur mobile; **bouton central ou droit maintenu et glissé** la déplace sur ordinateur. Le zoom est ancré sous le curseur / au centre du pincement. La projection orthographique cadre la carte dans l'espace au-dessus du panneau de commandes.
- **Factions :** boutons 🧙 et ⚔ en haut pour contrôler les sorcières ou les orcs.
- **Pause :** bouton Ⅱ ou **P**. **Échap** annule la construction/le rassemblement ou vide la sélection.

## Interface de type Warcraft

La barre inférieure présente **portrait, nom du bâtiment, niveau, points de vie, barre de santé, grille d'actions, file de production, progression et annulation avec remboursement**. Les boutons changent selon le type de sélection.

### Sorcières

La maison est le bâtiment de production. Elle commence au **niveau 1** avec **500 PV**. Chaque sorcière coûte **120 pièces d'or** et prend **3,5 secondes** de formation au niveau 1. Les ordres peuvent s'empiler (8 maximum).

- **Entraîner :** ajouter une sorcière à la file.
- **Améliorer :** construire le niveau 2 puis le niveau 3 (durée 8 puis 10 secondes). La maison atteint **750 puis 1 000 PV** et la formation devient **20 % puis 40 % plus rapide**.
- **Ralliement :** choisir un point d'apparition secondaire vers lequel les nouvelles sorcières se déplacent automatiquement.
- **Or initial :** 2 000. Aucun gisement n'est posé du côté sorcière.

### Orcs

Cinq modèles de bâtiments niveau 1 présents dès le départ : **caserne, hutte, mine, chaudron et atelier**, ainsi que quatre soldats orcs. La caserne peut **entraîner des orcs** pour 100 pièces d'or en 4,5 secondes au niveau 1. Les autres bâtiments proposent aussi **amélioration, ralliement et construction**.

- Les structures sont améliorables du **niveau 1 à 3**. L'upgrade met à jour les PV et **charge le véritable GLB de niveau 2 ou 3** depuis le jeu de bâtiments existant, sans modèle inventé.
- **Construire :** sélectionner un plan dans la grille de bâtiments, puis un emplacement libre dans le territoire orc. Construction impossible si elle chevauche un bâtiment ou une unité.
- **Or initial :** 900. Les coûts affichés dans la barre sont retirés lors de la commande. Les opérations en file peuvent être annulées et remboursées.

## Hitboxes et navigation — adaptation de WarConquer

Chaque bâtiment obtient une **AABB 3D calculée depuis son modèle GLB**, dans les coordonnées mondiales. La maison des sorcières et chacun des bâtiments orcs disposent d'un volume distinct, y compris les bâtiments ajoutés en cours de partie. Ces volumes sont employés pour :

1. sélectionner le bâtiment par un rayon depuis la caméra (et pas uniquement par distance au sol);
2. empêcher les chevauchements à la construction;
3. alimenter le moteur de navigation et interdire aux unités de traverser les édifices.

La navigation pure JS est dans `docs/rts-navigation.js`, inspirée de `leye0/WarConquer/scripts/perception-brain.js` :

- **A*** sur grille de 1 mètre, huit directions, heuristique octile, **sans couper les angles diagonaux**;
- **collision continue** d'un cercle mobile avec les AABB élargies, y compris à grands pas de simulation;
- **simplification des chemins** lorsqu'une ligne directe est libre;
- recherche du **point praticable le plus proche** si l'ordre vise l'intérieur d'un bâtiment;
- **invalidation du trajet** après la pose d'un obstacle et nouveau calcul de route si nécessaire.

Il s'agit d'une navigation autour des **structures statiques**. Le prototype n'implémente pas encore une séparation avancée des foules, l'économie/collecte, la recherche technologique ou les conditions de victoire.

## Animations et assets conservés

Les personnages utilisent toujours les **86 clips Quaternius** et leur **squelette natif de 65 os**. Les vêtements, cheveux et épées restent skinnés et montés sur le rig d'origine, sans retargeting. Le modèle de maison `witch_house.glb` est réutilisé; les bâtiments orcs sont extraits de `orc_rts_building_set_-_proto_series.glb.part1/.part2` au déploiement via `scripts/split-orc-buildings.mjs`.

## Tests automatisés

- `node scripts/test-rts-navigation.mjs` : A*, murs, hitbox gonflée par le rayon du personnage, anti-tunneling, obstruction dynamique, contournement sans couper les coins.
- `node scripts/browser-qa.mjs` : **Chrome/WebGL SwiftShader**, UI de bâtiments, zoom, formation des deux factions, amélioration des bâtiments avec **vrai GLB de niveau 2**, AABB, placement, déplacement autour d'une hutte avec audit de collision, réinitialisation et capture d'écran mobile.
- `.github/workflows/browser-qa.yml` prépare les modèles 3D et exécute les deux tests sur `main`.
- `.github/workflows/pages.yml` prépare et publie la démo. Ouvrir via **HTTPS** et non `file://`.

Le laboratoire d'animations `docs/motion-lab.html` reste indépendant et inchangé.
