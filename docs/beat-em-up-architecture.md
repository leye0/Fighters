# Fighters — direction de production : beat’em up 3D à défilement latéral

> **Décision de Léon, 30 octobre 2026.** Le produit est un **side-scrolling action beat’em up**, dans l’esprit des jeux d’action comme *Double Dragon*. Cette référence concerne la structure du gameplay, pas la reproduction d’une œuvre, de ses personnages ou de ses décors. La vision précédente de duel en arène façon jeu de combat 1 contre 1 est abandonnée comme expérience principale. Les modules et 71 scénarios 1v1 existants demeurent utiles comme bancs de simulation isolés.

## L’expérience voulue

Une **vraie scène 3D**, présentée par une caméra principalement latérale, déroule une succession de lieux. Le héros traverse une rue, entre dans des bâtiments, saute sur de gros bacs de poubelles, atteint des terrasses et des toits lorsque le level design le permet. Il affronte **plusieurs ennemis** sur le même parcours. Le monde continue à exister en 3D : géométrie, hauteur, obstacles, occlusion, ombres, collisions, profondeur.

Le joueur avance et recule librement. Lorsqu’un ennemi pertinent est proche, le corps et les coups **s’orientent vers cet ennemi indépendamment de la direction du déplacement**. Reculer en regardant l’ennemi n’est donc pas la même chose que tourner le dos et marcher. À distance, le regard/la posture reviennent vers le déplacement ou la dernière direction mémorisée.

## Physique volontairement « old school » — décision de Léon

**Pas de moteur physique général pour les personnages.** Le mouvement est cinématique et déterministe, calculé à 60 Hz par les règles du jeu. **Héroïne et ennemis peuvent se traverser et occuper les mêmes coordonnées** : aucune collision solide acteur–acteur, aucune pushbox, aucun déplacement forcé par la proximité d'un ennemi. Le ciblage et la résolution d'un coup restent indépendants et s'appuient sur les volumes temporaires d'attaque/réception, pas sur des forces physiques.

**Plateformes : faux moteur configurable par données.** Une plateforme connaît son empreinte X/Z, son altitude et ses règles de franchissement ; le moteur attribue un appui, une ascension, une chute, une réception ou un passage volontaire selon des conditions explicites. Il n'y a pas de simulation de rigid bodies, friction ou impulsions entre personnages. Le décor peut refuser de traverser un mur ou permettre une petite marche ; certaines surfaces à sens unique (`dropThrough`) autorisent une commande de descente à travers elles, sans rendre tous les toits traversables. Les autres descentes se font en quittant un rebord. Une escalade sera une **transition de gameplay contextuelle** (conditions de distance, hauteur, rebord et animation véritable), jamais la conséquence imprévisible d'un solveur.

**Garde-fou de production :** aucune animation d'escalade ou de chute n'est déclarée jouable avant l'acquisition et la validation de ses vrais clips. Le contrat d'input pour `drop` existe dans le noyau, mais son attribution aux boutons et ses animations restent à décider.

## Géométrie temporaire : simplicité volontaire

**Décision du 30 octobre 2026 :** les parcours et plateformes **ne reçoivent pas encore leur design visuel final**. Au cours de la mise au point, la rue peut être un plan neutre, le bâtiment une succession de volumes simples et le bac de poubelles un bloc de couleur. Le joueur doit cependant pouvoir y marcher, sauter, tomber, combattre et être suivi par la caméra avec les vraies règles. L’habillage architectural et les textures photoréalistes viennent **après les autres systèmes du jeu**. Ce choix ne retire aucune fonctionnalité ni aucun objectif de qualité de la version finie.

## Caméra de scrolling et limites de l’écran

Le héros se trouve au **centre exact de l’image** tant que la caméra peut se déplacer. La caméra suit la projection du héros sur les deux axes écran : X (progression) et axe vertical projeté (hauteur Y + éventuelle profondeur Z). Les limites de chaque section forment un rectangle de scrolling ; on **borne le centre caméra** avec la demi-largeur et la demi-hauteur visibles. Quand la caméra atteint le bord gauche, droit, haut ou bas, le héros continue vers ce bord de l’image tandis que le décor cesse de défiler sur cet axe. Une autre dimension peut continuer à défiler indépendamment ; aux coins, les deux s’arrêtent. Si le niveau est plus petit que l’écran, on cadre le niveau entier sans mouvement inutile.

Le calcul pur est dans `src/render/beat-scroll-camera.ts`, testé pour les quatre frontières, les coins, les petits espaces et le portrait. **Son branchement sur la vraie caméra Three.js et ses bornes de perspective reste à faire** : ce n’est pas encore une vérification visuelle.

## Repère déterministe, 60 ticks/s

| Axe | Usage | Exemple |
| --- | --- | --- |
| **X** | Avancer / reculer le long de la rue ; progression du scrolling | Longer le trottoir |
| **Profondeur (Z)** | Se décaler entre des bandes proches/lointaines, dans les surfaces accessibles | Contourner un ennemi ou une benne |
| **Hauteur (Y)** | Saut, chute, niveau d’appui, plateformes et toits | Monter sur un bac |

Les trois valeurs sont en **millimètres entiers** dans la simulation. La caméra et les modèles Three.js les convertissent en mètres. L’altitude d’un acteur est mesurée depuis le zéro du monde, **pas** comme une simple animation de saut au-dessus d’un unique sol de combat. Une plateforme est une surface praticable identifiée, avec une empreinte en X/Z et un sommet Y ; les volumes décoratifs/collision pourront être plus complexes mais ne déterminent jamais seuls le résultat du combat.

**Règles de locomotion voulues :**

1. Deux commandes de déplacement indépendantes (gauche/droite et profondeur), normalisation diagonale sans vitesse gratuite.
2. Saut distinct de la direction « profondeur » et de l’accroupissement, avec trajectoire, gravité et collision déterministes.
3. Petit seuil d’enjambement pour trottoirs et marches ; un gros bac ou un toit exige une vraie transition (saut, escalade ou itinéraire défini).
4. Appui sur une plateforme atteinte par le dessus ; descente d’une corniche = chute physique, pas téléportation au sol.
5. Les volumes du décor, les zones de navigation et les timings sont définis par données de gameplay, indépendamment du mesh artistique. **Aucune solidité entre personnages**.
6. Prévoir les déplacements pendant certaines frappes, à condition que le mélange animation/locomotion ait été jugé crédible.

## Ciblage et orientation

- En exploration sans menace proche : direction du mouvement horizontal, sinon orientation conservée.
- Un ennemi vivant de l’autre équipe, à une **distance horizontale + profondeur** compatible et à une hauteur accessible, devient un candidat de ciblage.
- **Acquisition à courte portée, relâchement à une portée un peu plus grande** : la cible ne change pas à chaque frame quand deux ennemis se croisent.
- À égalité, sélection déterministe et stable ; le moteur conserve l’identifiant de la cible dans l’état rejouable.
- Le ciblage sélectionne une menace, **pas une frappe automatique** et pas un « auto-hit ». Les attaques doivent encore satisfaire portée, hauteur, direction, ligne de vue et temps de contact.
- Le mouvement est indépendant de la direction du corps. Le rendu orientera graduellement le rig vers la cible en 3D ; l’état de simulation doit rester discret, déterministe et réplicable.
- Sans cible : le héros peut tourner à gauche/droite en se déplaçant. Les ennemis disposent du même contrat de ciblage et de déplacement.

## Combats et déroulement

- **Un héros contre plusieurs adversaires** ; ennemis actifs, vagues, renforts, zones de verrouillage, progression du scrolling et fins de section.
- Combat rapproché animation-first, poings/pieds, prises, coups sautés, réactions, chutes, objets et armes utilisables selon les clips réellement trouvés.
- Hitboxes/hurtboxes d'attaque et de réception en X/Z/Y, y compris profondeur, hauteur du sol et attaques au-dessus/dessous. **Pas de pushboxes entre acteurs** : on peut traverser un ennemi sans le pousser.
- Ennemis avec navigation multi-surfaces : descente, montée, contournement, détection des zones accessibles, distance d’attaque et alignement de profondeur.
- Architecture compatible avec plusieurs héros / coopération ultérieure, sans imposer une limite de deux acteurs au monde.
- Caméra latérale 3D suivant le héros **au centre exact de l’écran** sur les deux axes projetés, jusqu’aux frontières de scrolling gauche/droite/haut/bas ; pas de recentrage permanent sur plusieurs ennemis qui décentrerait le héros solo.
- Chaque niveau décrit ses plateformes, obstacles, entrées/sorties, apparitions d’ennemis, interactions et changements d’ambiance par **données**, pas par des conditions codées pour une benne particulière.

## Ce qui existe réellement dans le code

- **Acquis :** `src/engine/beat-em-up-world.ts` : déplacement entier X/profondeur, diagonales normalisées, appui sur des surfaces de hauteurs différentes, saut/chute, blocage des hautes marches, acquisition d’une cible proche avec hystérésis, orientation gauche/droite indépendante du déplacement, ennemis multiples ; tests de simulation.
- **Acquis :** `src/render/beat-scroll-camera.ts` : centrage logique exact et quatre frontières indépendantes, neuf tests ; rendu Three.js pas encore connecté.
- **Acquis :** [63 animations source retenues par Léon](../assets/mixamo-selected.json), avec identité et empreintes. Le script `scripts/pack-selected-mixamo.py` sait construire depuis 63 GLB privés **un seul GLB YBot de recherche** à 63 noms distincts en ne recopiant que les canaux d’animation et une seule géométrie source.
- **Pas encore fait :** connexion de ce monde aux contrôles/rendu/états de combat de production, hitboxes/hurtboxes de coups, rebords complexes, escalade contextuelle animée, navigation des IA et retargeting sur personnages photoréalistes. **Les collisions solides entre acteurs sont volontairement exclues**, pas « manquantes ».
- **Pas encore certifié :** rendu sur les personnages définitifs, retargeting, appuis de pieds, transitions, contacts et compatibilité des mélanges marche/frappe/saut. Les tests d’assemblage de GLB utilisent des fichiers synthétiques ; les 63 vrais fichiers doivent encore être réacquis pour un test réel de pack.
- **Historique maintenu :** `src/engine/simulation.ts` et les tests 1v1 prouvent certains comportements de combat à 60 Hz, mais ne définissent plus la géométrie ou la limite d’acteurs du jeu final.

## Acceptation requise pour le jeu jouable

1. Un niveau de rue réel, éclairé en 3D, avec au moins un obstacle haut accessible par saut, une seconde hauteur de bâtiment et un trajet de scrolling vérifiés à 60 Hz.
2. Déplacements et passages entre plateformes sans pénétration du décor, faux appui, chute infinie non prévue ou saut sous la surface.
3. Plusieurs ennemis capables de poursuivre, encercler et frapper sans oscillation du ciblage ; marche arrière du héros en **faisant toujours face** à l’adversaire proche.
   Les adversaires et l'héroïne peuvent se traverser sans poussée ; c'est une règle voulue, couverte par tests de régression.
4. Attaques sélectionnées parmi les **63 vraies animations**, pas parmi les 71 fixtures, avec retargeting et frames de contact mesurées.
5. Rendu photoréaliste et performance mesurés ensemble, puis **jugement de Léon sur une scène réellement jouable**. Aucun test statistique ne remplace cette appréciation.
