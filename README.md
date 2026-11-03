# Fighters — prototype RTS : sorcières contre orcs

**[Démo jouable](https://www.streamlev.com/Fighters/)** · [Laboratoire des 86 animations](https://www.streamlev.com/Fighters/motion-lab.html) · [Tests Chrome/WebGL](https://github.com/leye0/Fighters/actions/workflows/browser-qa.yml)

Fighters est un prototype de **stratégie en temps réel** en 3D isométrique. Le joueur commande les sorcières et la maison des sorcières; les **orcs sont une faction adverse autonome** qui produit des troupes, développe son village, défend ses bâtiments et lance des attaques. Le beat ’em up et ses gestes de combat direct ne font plus partie du jeu.

## Commandes

| Action | Ordinateur | Téléphone/tablette |
|---|---|---|
| Sélectionner une sorcière ou un bâtiment | Clic gauche | Toucher |
| Sélection multiple | Glisser sur la carte ou Ctrl/Cmd+A | **Deux doigts délimitent un rectangle** : posez les deux doigts, écartez/déplacez-les pour entourer les unités, puis soulevez-les |
| Déplacement / formation | Sélectionner puis cliquer au sol | Sélectionner puis toucher le terrain |
| Attaquer une unité ou un bâtiment ennemi | **Deux clics :** sélectionner une sorcière puis cliquer directement le bâtiment ou l'unité ennemie | **Deux touches :** sorcière puis bâtiment ennemi, sans passer par un mode supplémentaire |
| Zoom | **Fixe, aucune commande de zoom** | **Fixe, aucun pincement de zoom** |
| Déplacer la caméra | Glisser avec bouton central ou droit, **ou cliquer la mini-carte** | **Glisser avec un doigt ou toucher la mini-carte** |
| Pause | Touche **P** ou bouton Ⅱ discret | Bouton Ⅱ discret |

**Deux doigts servent uniquement à sélectionner des unités** : leurs positions forment les coins du rectangle vert visible immédiatement; soulever le premier doigt confirme la sélection, et le deuxième doigt ne produit aucune commande parasite. Le pincement ne change plus l'échelle, fixée à un grossissement de **3× celui de l'ancien démarrage** (hauteur orthographique 35 → 35/3). La partie commence près des trois sorcières, et non au milieu d'une carte désormais trop grande pour tenir sur l'écran. Un anneau bleu apparaît brièvement après un ordre de déplacement; une mire rouge confirme un ordre d'attaque. Les marqueurs disparaissent automatiquement et leur nombre simultané est plafonné.

La barre supérieure n'affiche plus que la faction active, les ressources, le total d'unités et le bouton pause. L'interface reprend maintenant la disposition de **Warcraft II** : petite console à gauche sur ordinateur et bande compacte en bas sur téléphone.

## Brouillard de guerre

La carte débute **noire hors du champ de vision des unités**. Chaque sorcière ou orc découvre progressivement un rayon de 7,5 unités en marchant. Les zones déjà visitées restent connues, mais sont assombries quand aucun éclaireur n'y voit encore, comme dans Warcraft. Les ennemis cachés ne peuvent pas être ciblés par un clic ou un toucher, mais il est toujours possible d'ordonner un déplacement vers une zone inconnue. Chaque clan garde sa propre exploration; une nouvelle partie efface la découverte.

La visibilité repose sur une grille de **112 × 112 cases (0,5 unité)**, commune à toutes les unités d'un clan. Les deux clans utilisent environ **147 Kio de données** au total, et un seul masque GPU couvrant l'écran; la grille est actualisée huit fois par seconde au maximum, sans ajout de modèles ou textures lourdes.

## Interface RTS — style Warcraft II

Sur ordinateur, l'écran de jeu reste majoritaire : **console verticale de 198 px à gauche**, mini-carte de 112 × 112 pixels mise à l'échelle, portrait de l'unité sélectionnée, points de vie et **grille de commandes carrées 3 × 3**. La barre de ressources tient sur une seule ligne de 36 px en haut. Une touche sur la mini-carte recentre la caméra.

Sur téléphone, les mêmes commandes tiennent dans une **bande de 141 px en bas** (plus la zone de sécurité du système) : mini-carte miniature à gauche, portrait/statistiques au centre et actions en icônes à droite. Les noms des actions restent disponibles dans leurs attributs d'accessibilité, mais ne grossissent plus les boutons. Les cinq raccourcis permanents (Maison, Armée, Attaquer, Stop, Annuler) occupent une seule rangée. Les coûts demeurent visibles en petit dans les boutons. La mini-carte réemploie le brouillard de guerre déjà calculé et un unique tampon CPU de ~49 Kio; elle ne charge aucune autre texture ou GLB.

La maison des sorcières et la caserne orc permettent d'entraîner trois rôles par clan (ouvrier, combattant de mêlée et combattant à distance), avec des coûts distincts et une file de huit commandes. Seul un ouvrier peut miner ou construire. Les améliorations de bâtiments, le ralliement et l'annulation/remboursement restent disponibles depuis la même grille.

## Performance et gestion des ressources

Le panneau contextuel n'est plus reconstruit à chaque mise à jour d'or ou de points de vie : les boutons restent les mêmes objets DOM et seules les valeurs dynamiques changent. Les statistiques de développement exposent le nombre de reconstructions. La planification de l'IA orc est évaluée à cadence réduite plutôt que de recréer les mêmes tableaux soixante fois par seconde. Les unités mortes libèrent leurs marqueurs et leurs actions, tandis que les constructions retirées libèrent les animations et barres de vie dont elles sont propriétaires. Les mires bleues/rouges ont une durée de vie limitée et un plafond simultané. Les tests de régression contrôlent la stabilité des menus sur une partie simulée prolongée.

## Combat contre les bâtiments

Les **unités et les bâtiments ennemis** sont des cibles du même système de combat : ordre d'attaque, acquisition automatique à proximité, approche jusqu'à portée de frappe, animation native, dégâts et recharge entre attaques.

Les bâtiments ont une santé, un identifiant et une **hitbox réelle 3D**. Lorsqu'un édifice tombe à zéro PV, le jeu le retire de la scène, annule sa production, supprime sa collision, enlève sa barre de vie et invalide les trajectoires des unités. **La destruction de la maison des sorcières provoque la défaite; celle du dernier bâtiment orc provoque la victoire.** La réinitialisation restaure la carte de départ.

Les **barres de vie orcs** ne sont plus des enfants des GLB redimensionnés/tournés. Elles sont attachées à la scène, placées au-dessus de leur hitbox et orientées vers la caméra dans le repère mondial. Cela élimine leur rotation parasite de 90°.

## Navigation — inspirée de WarConquer

Le fichier `docs/rts-navigation.js` adapte les principes utiles de `leye0/WarConquer/scripts/perception-brain.js` :

- **A*** sur grille de 1 m, huit directions, heuristique octile et aucun passage en diagonale entre deux coins bloqués;
- détection continue **cercle mobile contre AABB**, sans traverser un mur lors d'un grand pas de simulation;
- trajectoire directe quand l'espace est libre, points intermédiaires et simplification sinon;
- destination praticable lorsque l'utilisateur désigne un endroit occupé;
- recalcul de chemin après construction **ou destruction** de bâtiments.

Les bâtiments possèdent maintenant **deux volumes distincts** calculés sur les vrais GLB : le volume visuel complet pour sélectionner les toits au toucher, et la **base physique au niveau du sol** pour la navigation, la construction et les combats. Les personnages combattent depuis la frontière physique et regardent le centre du bâtiment. Les bâtiments sont des **obstacles rigides**. Les personnages utilisent maintenant `docs/rts-unit-physics.js` : **évitement local souple**, anticipation des zones encombrées, légère dispersion des unités immobiles et **destinations de groupe réservées et uniques**, y compris lorsque la cible touche un mur ou le bord du terrain. L'évitement local s'atténue au point d'arrivée pour éviter les marches perpétuelles. Une unité ne bloque pas rigidement les autres : si un passage n'offre aucune alternative, elles peuvent temporairement se chevaucher plutôt que de se coincer. La séparation de très grandes armées peut encore être améliorée.

## IA orc autonome

`docs/orc-strategy.js` implémente un **directeur stratégique déterministe**, indépendant de Three.js. Il analyse périodiquement la composition du village, la trésorerie, les files de production, les unités, la pression ennemie et le temps écoulé :

1. **Économie :** des mineurs orcs doivent rejoindre physiquement une mine et terminer un cycle de travail avant que l'or soit crédité. **Aucun revenu passif** n'est généré par une mine vide. Les mines sont **des gisements naturels fixes, non constructibles**, aussi bien pour le joueur que pour l'IA. Cette dernière entretient ses mineurs, améliore ses installations et développe les autres bâtiments.
2. **Urbanisme :** un planificateur propose des emplacements candidats dans des secteurs du territoire orc, avec marges autour des bâtiments, espacement et préférence pour les regroupements fonctionnels. La validation utilise les vraies hitboxes.
3. **Production :** les casernes entraînent régulièrement des orcs dans leur file, avec une limite de population. Un ordonnanceur réserve des tours aux constructions et aux améliorations pour éviter que la production militaire ne monopolise les dépenses.
4. **Défense :** lorsque des sorcières s'approchent du village, les orcs à portée reçoivent des objectifs de défense.
5. **Offensive :** l'IA regroupe une force suffisante avant de lancer un raid contre la maison des sorcières. Elle tient compte du temps de développement du village et peut reconstruire une caserne perdue.

Cette IA est **un moteur de décisions tactiques et économiques par règles**, pas un modèle neuronal ni une intelligence de niveau compétitif professionnel. Il reste possible de développer des formations plus avancées, du micro-management de combats et une économie récoltable.

## Modèles et déploiement

Le **jeu RTS** utilise désormais deux modèles GLB légers dérivés du même kit Quaternius, avec leur **squelette natif de 65 os**, leur géométrie, leur skinning et les **8 animations natives utiles au combat** conservées avec leurs données de keyframes intactes : Idle, Walk, Jog, Punch, Hit, Death et deux animations d'épée. Aucune animation n'est retargetée. Les deux **GLB originaux à 86 animations** restent disponibles sans modification dans le laboratoire `docs/motion-lab.html`.

Pour un premier chargement sur mobile, `scripts/build-runtime-characters.mjs` produit des textures matérielles **WebP 1024 px**, et le déploiement publie des fichiers `.rts.glb.gz` compacts. Vérification Chrome en CI : **1 369 646 octets** pour la sorcière et **1 319 478 octets** pour l'orc, soit **2,69 Mo contre 41,68 Mo précédemment** (−93,6 %). Three.js et ses dépendances sont servis localement dans le site, sans CDN tiers. Les téléchargements sont parallèles, les requêtes ont un délai maximal et une solution de repli vers le GLB runtime non compressé, et les problèmes d'import de modules affichent un bouton de rechargement plutôt que laisser un écran bloqué. Le chargement du village orc reste différé jusqu'à la préparation des personnages.

`witch_house.glb` est un véritable modèle 3D. Les cinq types orcs (caserne, hutte, mine, chaudron et atelier) sont extraits du GLB fourni pendant la préparation du déploiement Pages, sans remplacement procédural des modèles.

## Tests

Le workflow `.github/workflows/browser-qa.yml` exécute :

- `node scripts/test-rts-navigation.mjs` : A*, collisions élargies, coins diagonaux, détours et obstacles dynamiques.
- `node scripts/test-rts-unit-physics.mjs` : préférence de séparation en terrain libre, **passage temporairement superposé** dans un corridor, réservations de **20 emplacements distincts**, dispersion progressive à l'arrêt et murs toujours solides.
- `node scripts/test-orc-strategy.mjs` : construction cohérente, stratégie économique, recrutement, défense, raiders et réinitialisation.
- `node scripts/browser-qa.mjs` : vraie scène **Chrome WebGL SwiftShader**, **caméra à zoom fixe 3×**, **glisser à un doigt pour déplacer**, **sélection rectangulaire immédiate par deux doigts** et capture des pointeurs, séquence de **deux touches pour attaquer**, mires bleues et rouges à durée de vie limitée, stabilité des menus, production et améliorations avec vrais GLB, collisions, **destruction des bâtiments par les deux factions** et **village orc bâti automatiquement**. Le test enregistre également des captures desktop et mobile.

Un paramètre `?qa=1` active les contrôles d'injection de test `window.__fightersQA` et désactive l'IA autonome initialement pour des essais reproductibles; la partie normale active l'IA.

Le laboratoire d'animations `docs/motion-lab.html` est conservé. Ouvrir le jeu via HTTPS et non en `file://`.
