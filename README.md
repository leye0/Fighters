# Fighters — prototype RTS : sorcières contre orcs

**[Démo jouable](https://www.streamlev.com/Fighters/)** · [Laboratoire des 86 animations](https://www.streamlev.com/Fighters/motion-lab.html) · [Tests Chrome/WebGL](https://github.com/leye0/Fighters/actions/workflows/browser-qa.yml)

Fighters est un prototype de **stratégie en temps réel** en 3D isométrique. Le joueur commande les sorcières et la maison des sorcières; les **orcs sont une faction adverse autonome** qui produit des troupes, développe son village, défend ses bâtiments et lance des attaques. Le beat ’em up et ses gestes de combat direct ne font plus partie du jeu.

## Commandes

| Action | Ordinateur | Téléphone/tablette |
|---|---|---|
| Sélectionner une sorcière ou un bâtiment | Clic gauche | Toucher |
| Sélection multiple | Glisser sur la carte, Ctrl/Cmd+A | Glisser sur la carte |
| Déplacement / formation | Sélectionner puis cliquer au sol | Sélectionner puis toucher le terrain |
| Attaquer une unité ou un bâtiment ennemi | Sélectionner des sorcières puis cliquer la cible; touche **F** pour cibler | Sélectionner les sorcières, bouton **Attaquer**, toucher la cible |
| Zoom | Molette, touches **+ / −** | Pincement à deux doigts |
| Déplacer la caméra | Glisser avec bouton central ou droit | Glisser avec deux doigts |
| Pause | Touche **P** ou bouton Ⅱ discret | Bouton Ⅱ discret |

Le groupe **🧙 / ⚔ / + / −** qui occupait la barre supérieure a été retiré. La carte conserve seulement les ressources, un état résumé de l'IA orc et un petit bouton pause. Les véritables commandes sont dans la barre inférieure contextuelle, inspirée des RTS classiques.

## Interface RTS

La **barre inférieure** affiche le portrait, le nom et le niveau du bâtiment sélectionné, les points de vie, une barre de santé et une grille de commandes. Selon le contexte, elle propose **entraînement, amélioration, point de rassemblement et annulation/remboursement des commandes**.

- La maison des sorcières entraîne une sorcière pour **120 pièces d’or** en **3,5 s** au niveau 1. Les améliorations augmentent ses PV et accélèrent la formation. La file contient jusqu'à huit commandes.
- La caserne orc forme des soldats pour **100 pièces d’or** en **4,5 s** au niveau 1; toutes les structures peuvent être améliorées jusqu'au niveau 3. Les niveaux 2 et 3 utilisent les véritables GLB existants du kit de bâtiments.
- Le point de rassemblement fait marcher les nouvelles unités vers une destination spécifiée.
- Les sorcières commencent avec **2 000 pièces d’or**, sans gisement de ressources sur leur territoire. L'économie est encore provisoire.

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

Les hitboxes des bâtiments sont calculées à partir du véritable volume 3D mondial du GLB, et servent à la sélection par rayon, aux conflits de construction et à la navigation. Les obstacles sont statiques; la séparation avancée des grandes foules entre unités n'est **pas encore** traitée.

## IA orc autonome

`docs/orc-strategy.js` implémente un **directeur stratégique déterministe**, indépendant de Three.js. Il analyse périodiquement la composition du village, la trésorerie, les files de production, les unités, la pression ennemie et le temps écoulé :

1. **Économie :** les mines produisent un revenu d'or progressif, au rythme de la simulation. L'IA maintient une réserve de trésorerie et réinvestit dans des mines.
2. **Urbanisme :** un planificateur propose des emplacements candidats dans des secteurs du territoire orc, avec marges autour des bâtiments, espacement et préférence pour les regroupements fonctionnels. La validation utilise les vraies hitboxes.
3. **Production :** les casernes entraînent régulièrement des orcs dans leur file, avec une limite de population. Un ordonnanceur réserve des tours aux constructions et aux améliorations pour éviter que la production militaire ne monopolise les dépenses.
4. **Défense :** lorsque des sorcières s'approchent du village, les orcs à portée reçoivent des objectifs de défense.
5. **Offensive :** l'IA regroupe une force suffisante avant de lancer un raid contre la maison des sorcières. Elle tient compte du temps de développement du village et peut reconstruire une caserne perdue.

Cette IA est **un moteur de décisions tactiques et économiques par règles**, pas un modèle neuronal ni une intelligence de niveau compétitif professionnel. Il reste possible de développer des formations plus avancées, du micro-management de combats et une économie récoltable.

## Modèles et déploiement

Les personnages conservent leurs **86 animations Quaternius natives**, leur squelette de **65 os**, leurs costumes et coiffures adaptés au squelette original et leurs épées montées sur l'os de la main, sans retargeting. `witch_house.glb` est un véritable modèle 3D. Les cinq types orcs (caserne, hutte, mine, chaudron et atelier) sont extraits du GLB fourni pendant la préparation du déploiement Pages, sans remplacement procédural des modèles.

## Tests

Le workflow `.github/workflows/browser-qa.yml` exécute :

- `node scripts/test-rts-navigation.mjs` : A*, collisions élargies, coins diagonaux, détours et obstacles dynamiques.
- `node scripts/test-orc-strategy.mjs` : construction cohérente, stratégie économique, recrutement, défense, raiders et réinitialisation.
- `node scripts/browser-qa.mjs` : vraie scène **Chrome WebGL SwiftShader**, zoom/pincement, sélection, production et améliorations avec vrais GLB, barres de vie en repère mondial, construction, collisions, **destruction effective par les deux factions**, défaite et **village orc bâti automatiquement**. Le test enregistre également des captures desktop et mobile.

Un paramètre `?qa=1` active les contrôles d'injection de test `window.__fightersQA` et désactive l'IA autonome initialement pour des essais reproductibles; la partie normale active l'IA.

Le laboratoire d'animations `docs/motion-lab.html` est conservé. Ouvrir le jeu via HTTPS et non en `file://`.
