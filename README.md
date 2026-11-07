# Orks & Sorcières — prototype RTS

## Organisation du dépôt

- `app/` : site jouable complet (`index.html`, moteur, styles, sons et modèles).
  C'est le répertoire servi par la QA Chrome et publié par GitHub Pages.
- `docs/` : documentation technique (`architecture.md`, `ci-metrics.md`).
- `scripts/` : tests, génération et restauration des ressources ; `assets/`
  contient le verrou de la Release des ressources précompilées.

Pour un aperçu local après restauration des ressources avec
`bash scripts/use-pinned-runtime-assets.sh`, lancer
`python3 -m http.server 8000 --directory app` et ouvrir
`http://localhost:8000/`.

## Remparts orcs

Les ouvriers orcs peuvent maintenant construire des **petits murs de pierre**
depuis « Bât. base » (32 or, 10 bois par segment). Les assises en maçonnerie,
les pierres de couvrement et les piliers d'extrémité sont composés de quelques
maillages instanciés partagés. Les segments s'alignent et se raccordent aux
angles à 90°, bloquent réellement les déplacements des unités et interceptent
les projectiles magiques ennemis. Ils apparaissent du sol vers le haut pendant
les six secondes du chantier, peuvent être attaqués, détruits et réparés.

La règle de placement s'applique aux deux factions : un nouveau bâtiment doit
être au plus à **8 unités** du contour d'un bâtiment allié existant (hors mur
et gisement neutre). Un mur peut commencer à **16 unités** du contour d'un
bâtiment orc ou se prolonger à **1 unité** au plus d'un autre mur; les murs
peuvent toucher leurs voisins pour ne laisser aucune brèche. L'IA propose un
rempart à distance des édifices, réserve une entrée occidentale de 6,4 unités,
évite les constructions trop serrées et vérifie que sa pose ne condamne pas
la dernière sortie navigable du village. Les pierres n'offrent pas de vision
magique supplémentaire et ne prolongent pas la partie lorsque les derniers
véritables bâtiments orcs sont détruits.

## Camp orc : huttes, chaudron et nourriture

Les **huttes** déterminent désormais la population maximale des orcs : une base
de quatre places, puis six, dix ou quatorze places par hutte de niveau 1, 2 ou 3.
Les unités déjà entraînées restent présentes si une hutte est détruite, mais
aucune nouvelle unité ne peut être produite tant que la capacité manque.
L'IA prend en compte cette limite et améliore les huttes pour poursuivre son expansion.

Le **chaudron** est indispensable pour entraîner des **Lanceurs-mages** dans
les casernes. Ces combattants à distance utilisent des projectiles magiques;
si tous les chaudrons tombent, leur recrutement est bloqué jusqu'à reconstruction.

Les orcs ont aussi leur propre réserve de vivres. Ils consomment **0,027 unité
par orc et par seconde**, contre 0,06 pour une sorcière, et subissent des dégâts
de famine lorsque la réserve est vide. Les orcs libres peuvent chasser et manger
un des **seize lièvres sauvages** qui se déplacent et bondissent librement dans
la forêt (+9 vivres, renouvellement après 48 à 63 secondes). Ils privilégient
les **corps de sorcières** lorsqu'ils en trouvent après la bataille : un corps
ne peut être consommé qu'une seule fois et rapporte **42 vivres**. Le combat et
les ordres explicites restent prioritaires sur la recherche de nourriture.
Les lièvres sont des animaux neutres, non sélectionnables et invisibles sur la
mini-carte; leur modèle low-poly est partagé et chargé à la demande depuis le
[CDN officiel Polyfork](app/HARE_ASSET_LICENSE.md).

**[Démo jouable](https://www.streamlev.com/Fighters/)** · [Laboratoire des 86 animations](https://www.streamlev.com/Fighters/motion-lab.html) · [Tests Chrome/WebGL](https://github.com/leye0/Fighters/actions/workflows/browser-qa.yml)

### Cercle de roches

Les ouvrières peuvent construire un **Cercle de roches** pour 260 or et 85 bois.
Six véritables menhirs low-poly entourent un centre magique turquoise scintillant,
entièrement accessible aux unités. Les sorcières situées dans son rayon de
guérison regagnent **11 PV/s** (sans dépasser leur maximum). Lorsqu'une sorcière
libre est sous **70 %** de vie et qu'aucun ennemi n'est proche, elle se dirige
automatiquement vers un cercle accessible, y reste jusqu'à **96 %** de vie,
puis reprend son activité autonome. Les ordres du joueur et les tâches en cours
restent prioritaires; les orcs ne bénéficient pas de la guérison. Les six pierres
partagent un seul modèle GLB de 24 Kio, sous [licence CC0](app/models/STANDING_STONE_LICENSE.md).

Orks & Sorcières est un prototype de **stratégie en temps réel** en 3D isométrique. À l'écran de démarrage, le joueur choisit d'incarner les **sorcières** ou les **orks**. Il contrôle uniquement son camp; l'autre faction est autonome et peut développer son village, produire des troupes, récolter des ressources, explorer, défendre ses bâtiments et attaquer. Le beat ’em up et ses gestes de combat direct ne font plus partie du jeu.

### Carte carrée en projection isométrique

La caméra conserve son azimut à 45° et son élévation isométrique. Le terrain jouable est orienté et dimensionné pour **apparaître carré à l'écran**, plutôt qu'en losange. La mini-carte carrée reprend exactement les axes visuels du terrain (gauche/droite, haut/bas), et son cadre montre l'emprise réelle de la caméra. Les personnages et les bâtiments conservent leurs coordonnées physiques X/Z; `app/rts-map.js` centralise la conversion de ces coordonnées, les limites de navigation et les clics sur la mini-carte. Le brouillard de guerre garde des rayons de vision circulaires dans le monde 3D.

## Commandes

| Action | Ordinateur | Téléphone/tablette |
|---|---|---|
| Sélectionner une unité de votre clan ou un bâtiment | Clic gauche | Toucher |
| Sélection multiple | Glisser sur la carte ou Ctrl/Cmd+A | **Deux doigts délimitent un rectangle** : posez les deux doigts, écartez/déplacez-les pour entourer les unités, puis soulevez-les |
| Déplacement / formation | Sélectionner puis cliquer au sol | Sélectionner puis toucher le terrain |
| Attaquer une unité ou un bâtiment ennemi | **Deux clics :** sélectionner une sorcière puis cliquer directement le bâtiment ou l'unité ennemie | **Deux touches :** sorcière puis bâtiment ennemi, sans passer par un mode supplémentaire |
| Réparer un bâtiment allié endommagé | Sélectionner un ouvrier puis cliquer le bâtiment, ou bouton **🔨 Réparer** pour le plus proche | Sélectionner une ouvrière/un ouvrier puis toucher le bâtiment, ou bouton **🔨 Réparer** |
| Zoom | **Fixe, aucune commande de zoom** | **Fixe, aucun pincement de zoom** |
| Déplacer la caméra | Glisser avec bouton central ou droit, **ou cliquer la mini-carte** | **Glisser avec un doigt ou toucher la mini-carte** |
| Pause | Touche **P** ou bouton Ⅱ discret | Bouton Ⅱ discret |

**Deux doigts servent uniquement à sélectionner des unités** : leurs positions forment les coins du rectangle vert visible immédiatement; soulever le premier doigt confirme la sélection, et le deuxième doigt ne produit aucune commande parasite. Le pincement ne change plus l'échelle, fixée à un grossissement de **4,05× celui de l'ancien démarrage**, soit **35 % de plus** que le précédent zoom 3× (hauteur orthographique 35 → 35/(3 × 1,35)). La partie commence près des trois sorcières, et non au milieu d'une carte désormais trop grande pour tenir sur l'écran. Un anneau bleu apparaît brièvement après un ordre de déplacement; une mire rouge confirme un ordre d'attaque. Les marqueurs disparaissent automatiquement et leur nombre simultané est plafonné.

La barre supérieure n'affiche que la faction choisie, ses ressources (**💰 or, 🪵 bois, 🌾 nourriture chez les sorcières**), le total d'unités et le bouton pause. Le choix de faction est fait au démarrage ou entre les parties, sans changement de clan en cours de match. L'interface reprend la disposition de **Warcraft II** : petite console à gauche sur ordinateur et bande compacte en bas sur téléphone.

## Brouillard de guerre

La carte débute **noire hors du champ de vision des unités**. Chaque sorcière ou orc découvre progressivement un rayon de 7,5 unités en marchant. Une fois une zone découverte, elle reste **entièrement visible pour le reste de la partie** : le brouillard noir ne revient pas après le départ des unités. Les ennemis cachés ne peuvent pas être ciblés par un clic ou un toucher, mais il est toujours possible d'ordonner un déplacement vers une zone inconnue. Chaque clan garde sa propre exploration; une nouvelle partie efface la découverte.

La visibilité repose sur une grille de **112 × 112 cases (0,5 unité)**, commune à toutes les unités d'un clan. Les deux clans utilisent environ **147 Kio de données** au total, et un seul masque GPU couvrant l'écran; la grille est actualisée huit fois par seconde au maximum, sans ajout de modèles ou textures lourdes.

## Corbeaux familiers des sorcières

Quatre **vrais corbeaux 3D animés** se posent sur la cime des arbres près des sorcières. Ils quittent périodiquement leur perchoir, volent d'arbre en arbre, puis s'y reposent. Un arbre abattu ou un orc approchant provoque leur envol. Ils ne prennent pas de place au sol, ne sont pas des combattants et ne peuvent pas mourir.

**Sélectionnez directement un corbeau** sur la carte, puis touchez le terrain pour lui donner un ordre de déplacement (ou choisissez son bouton **🧭 Déplacer**). Le corbeau rejoint la destination, effectue quelques détours de reconnaissance volontairement imprécis, puis retourne se poser sur un arbre. Son champ de vision en vol est limité à **3,1 unités** (contre 7,5 pour les unités ordinaires) et dévoile progressivement le brouillard de guerre de la faction des sorcières uniquement. Les orcs qui aperçoivent un corbeau peuvent abandonner momentanément leur trajet pour le poursuivre, sans parvenir à l'attaquer; ils reprennent ensuite leurs activités.

Le modèle externe [Crow de Polyfork](https://polyfork.dev/asset/crow-base) conserve son squelette et ses animations natives `Fly` et `Idle`. Il est partagé par les quatre corbeaux et chargé à la demande depuis le **CDN officiel**, conformément à la licence (GLB d'environ 2,94 Mo, sans textures supplémentaires). [Source et licence](app/models/RAVEN_ASSET_LICENSE.md).

## Forêt fantastique

Le décor urbain provisoire a laissé place à des chemins de terre et à **55 vrais arbres 3D**, exclusivement des arbres tortueux rougeâtres et des arbres morts sombres. Les bosquets sont plus mystiques du côté des sorcières et plus austères du côté des orcs. Leur disposition est déterministe et préserve les bâtiments et les points de départ.

Deux modèles d'arbres du créateur **Quaternius**, sous licence **CC0**, sont intégrés localement et totalisent environ **800 Kio** après réduction des textures en WebP 256 px. Le rendu réemploie les géométries et matériaux dans des instances GPU; un petit obstacle représente seulement le tronc, et les unités peuvent passer sous les branches. Une ouvrière sélectionnée peut toucher un arbre découvert : elle s'en approche, le coupe avec une hache et l'animation native `TreeChopping_Loop`, puis l'arbre laisse au sol une **petite brassée de bûches** (modèle Quaternius CC0 de 27 Ko). Elle se penche pour ramasser les bûches, les porte devant elle et les livre à un bâtiment de son clan. **Chaque arbre rapporte 80 bois uniquement à la livraison**; on peut aussi cliquer sur une brassée abandonnée pour la reprendre. La coupe retire la collision du tronc, interrompre un transport remet ses bûches au sol et une nouvelle partie restaure les arbres. [Sources et licences](app/models/forest/ASSET_LICENSES.md).

Le bois est une deuxième monnaie de construction : maison des sorcières **75**, huttes orcs **55**, casernes **95**, chaudrons **80** et usines **130** bois. Les améliorations coûtent **40** bois en plus de l'or; les potagers restent en terre et ne nécessitent que de l'or. Les deux factions ont leur propre réserve initiale (250/350 bois), débitée au lancement du chantier et remboursée si celui-ci est annulé. Le village orc affecte un bûcheron lorsqu'il manque de bois.

## Interface RTS — style Warcraft II

Sur ordinateur, l'écran de jeu reste majoritaire : **console verticale de 198 px à gauche**, mini-carte de 112 × 112 pixels mise à l'échelle, portrait de l'unité sélectionnée, points de vie et **grille de commandes carrées 3 × 3**. La barre de ressources tient sur une seule ligne de 36 px en haut. Une touche sur la mini-carte recentre la caméra.

Sur téléphone, les mêmes commandes tiennent dans une **bande de 141 px en bas** (plus la zone de sécurité du système) : mini-carte miniature à gauche, portrait/statistiques au centre et actions en icônes à droite. Les noms des actions restent disponibles dans leurs attributs d'accessibilité, mais ne grossissent plus les boutons. Les cinq raccourcis permanents (Maison, Armée, Attaquer, Stop, Annuler) occupent une seule rangée. Les coûts demeurent visibles en petit dans les boutons. La mini-carte réemploie le brouillard de guerre déjà calculé et un unique tampon CPU de ~49 Kio; elle ne charge aucune autre texture ou GLB.

La maison des sorcières et la caserne orc permettent d'entraîner trois rôles par clan (ouvrier, combattant de mêlée et combattant à distance), avec des coûts distincts et une file de huit commandes. Seul un ouvrier peut miner ou construire. Les améliorations de bâtiments, le ralliement et l'annulation/remboursement restent disponibles depuis la même grille.

**Réparation rapide :** les ouvriers des deux factions réparent leurs propres bâtiments (maison, potager, cercle de roches et bâtiments orcs). Un clic/toucher direct sur la structure endommagée donne l'ordre sans la sélectionner. L'ouvrier rejoint le contour, frappe au marteau et restaure **18 % des PV maximum par seconde** à portée, soit environ 5,6 secondes pour reconstruire les PV d'un bâtiment presque détruit. Plusieurs ouvriers accélèrent la réparation. Aucun coût supplémentaire en ressources; un nouvel ordre interrompt le travail. Les bâtiments détruits, ennemis et mines neutres ne sont jamais réparables.

## Performance et gestion des ressources

Le panneau contextuel n'est plus reconstruit à chaque mise à jour d'or ou de points de vie : les boutons restent les mêmes objets DOM et seules les valeurs dynamiques changent. Les statistiques de développement exposent le nombre de reconstructions. La planification de l'IA orc est évaluée à cadence réduite plutôt que de recréer les mêmes tableaux soixante fois par seconde. Les unités mortes conservent leur animation de chute au sol pendant deux minutes, puis libèrent leurs squelettes et leurs actions; un plafond de 40 cadavres limite la mémoire durant les grandes batailles. Les constructions retirées libèrent les animations et barres de vie dont elles sont propriétaires. Les mires bleues/rouges ont une durée de vie limitée et un plafond simultané. Les tests de régression contrôlent la stabilité des menus sur une partie simulée prolongée.

Pendant une construction, chaque cycle du geste d'ouvrier peut déclencher un bref coup de marteau réel, partagé par les deux clans. Il se produit au moment de l'impact du geste, uniquement à proximité de la caméra et dans une zone explorée, avec une limite globale d'un coup toutes les 450 ms. Les moteurs audio déjà présents assurent le décodage paresseux, la pause et la libération des voix; le fichier MP3 de 4,8 Ko est sous licence CC0 ([source et détails](app/sounds/WORK_ATTRIBUTION.md)).

Les ouvriers utilisent désormais une **pioche** dans les mines, un **marteau** pour construire et réparer et une **hache** pour couper les arbres. Les récoltes continuent de se faire à la main. Ces outils low-poly utilisent des géométries et matériaux partagés, sans téléchargement de modèle supplémentaire.

## Combat contre les bâtiments

Les **unités et les bâtiments ennemis** sont des cibles du même système de combat : ordre d'attaque, acquisition automatique à proximité, approche jusqu'à portée de frappe, animation native, dégâts et recharge entre attaques.

Les bâtiments ont une santé, un identifiant et une **hitbox réelle 3D**. Lorsqu'un édifice tombe à zéro PV, le jeu le retire de la scène, annule sa production, supprime sa collision, enlève sa barre de vie et invalide les trajectoires des unités. **La destruction de la maison principale des sorcières fait gagner les orks; celle du dernier bâtiment ork fait gagner les sorcières.** Le résultat est présenté du point de vue du camp incarné. La réinitialisation restaure la carte de départ.

Les **barres de vie orcs** ne sont plus des enfants des GLB redimensionnés/tournés. Elles sont attachées à la scène, placées au-dessus de leur hitbox et orientées vers la caméra dans le repère mondial. Cela élimine leur rotation parasite de 90°.

## Navigation — inspirée de WarConquer

Le fichier `app/rts-navigation.js` adapte les principes utiles de `leye0/WarConquer/scripts/perception-brain.js` :

- **A*** sur grille de 1 m, huit directions, heuristique octile et aucun passage en diagonale entre deux coins bloqués;
- détection continue **cercle mobile contre AABB**, sans traverser un mur lors d'un grand pas de simulation;
- trajectoire directe quand l'espace est libre, points intermédiaires et simplification sinon;
- destination praticable lorsque l'utilisateur désigne un endroit occupé;
- recalcul de chemin après construction **ou destruction** de bâtiments.

Les bâtiments possèdent maintenant **deux volumes distincts** calculés sur les vrais GLB : le volume visuel complet pour sélectionner les toits au toucher, et la **base physique au niveau du sol** pour la navigation, la construction et les combats. Les personnages combattent depuis la frontière physique et regardent le centre du bâtiment. Les bâtiments sont des **obstacles rigides**. Les personnages utilisent maintenant `app/rts-unit-physics.js` : **évitement local souple**, anticipation des zones encombrées, légère dispersion des unités immobiles et **destinations de groupe réservées et uniques**, y compris lorsque la cible touche un mur ou le bord du terrain. L'évitement local s'atténue au point d'arrivée pour éviter les marches perpétuelles. Une unité ne bloque pas rigidement les autres : si un passage n'offre aucune alternative, elles peuvent temporairement se chevaucher plutôt que de se coincer. La séparation de très grandes armées peut encore être améliorée.

## IA orc autonome

`app/orc-strategy.js` implémente un **directeur stratégique déterministe**, indépendant de Three.js. Il analyse périodiquement la composition du village, la trésorerie, les files de production, les unités, la pression ennemie et le temps écoulé :

1. **Économie :** des mineurs orcs doivent rejoindre physiquement une mine et terminer un cycle de travail avant que l'or soit crédité. **Aucun revenu passif** n'est généré par une mine vide. Les mines sont **des gisements naturels fixes, non constructibles**, aussi bien pour le joueur que pour l'IA. Cette dernière entretient ses mineurs, améliore ses installations et développe les autres bâtiments.
2. **Urbanisme :** un planificateur propose des emplacements candidats dans des secteurs du territoire orc, avec marges autour des bâtiments, espacement et préférence pour les regroupements fonctionnels. La validation utilise les vraies hitboxes.
3. **Production :** les casernes entraînent régulièrement des orcs dans leur file, avec une limite de population. Un ordonnanceur réserve des tours aux constructions et aux améliorations pour éviter que la production militaire ne monopolise les dépenses.
4. **Défense :** lorsque des sorcières s'approchent du village, les orcs à portée reçoivent des objectifs de défense.
5. **Offensive :** l'IA regroupe une force suffisante avant de lancer un raid contre la maison des sorcières. Elle tient compte du temps de développement du village et peut reconstruire une caserne perdue.

Cette IA est **un moteur de décisions tactiques et économiques par règles**, pas un modèle neuronal ni une intelligence de niveau compétitif professionnel. Il reste possible de développer des formations plus avancées, du micro-management de combats et une économie récoltable.

## IA sorcière autonome

Lorsque le joueur choisit les orks, `app/witch-strategy.js` dirige les sorcières par règles, à une fréquence réduite et avec une mémoire d'exploration indépendante :

1. **Survie et économie :** recrutement d'ouvrières, culture de potagers selon les réserves de nourriture, coupe et livraison de bois, extraction physique d'or uniquement dans les mines déjà découvertes.
2. **Expansion et magie :** placement des bâtiments après validation des vraies empreintes au sol, amélioration de la maison, construction du cercle de roches et recrutement d'Arcanistes lorsque cette technologie est débloquée.
3. **Défense et soins :** réparations des structures endommagées, riposte aux ennemis visibles à proximité, guérison et récolte des âmes par les mécanismes autonomes existants.
4. **Reconnaissance et offensives :** envoi d'éclaireuses vers les zones inconnues de leur propre brouillard de guerre, puis raids en groupe seulement contre des bâtiments adverses effectivement découverts.

En mode normal, **une seule IA stratégique dirige le camp adverse**. Le joueur garde ses commandes directes, et les tests conservent leurs contrôles de simulation isolés. Le scénario de choix de clan et l'IA sorcière sont couverts par `scripts/test-witch-strategy.mjs` et les tests navigateur.

## Modèles et déploiement

Le **jeu RTS** utilise désormais deux modèles GLB légers dérivés du même kit Quaternius, avec leur **squelette natif de 65 os**, leur géométrie, leur skinning et les **8 animations natives utiles au combat** conservées avec leurs données de keyframes intactes : Idle, Walk, Jog, Punch, Hit, Death et deux animations d'épée. Aucune animation n'est retargetée. Les deux **GLB originaux à 86 animations** restent disponibles sans modification dans le laboratoire `app/motion-lab.html`.

Les **orcs** ont désormais quatre nuances de **vert vif saturé**, avec une légère contribution lumineuse pour que leur peau reste reconnaissable sous les arbres. La peau de leurs mains est visible au même titre que celle du visage. Leur vêtement masculin a un **torse, des épaules et des bras nettement plus massifs** : les sommets du costume sont élargis progressivement en position de repos et mis en cache pour toutes les unités. Cette transformation ne déplace **aucun os du squelette**, n'étire pas la taille globale du personnage et protège les sommets influencés par les os de préhension. Ainsi, les animations natives, les prises d'épée/hache/pioche/marteau et les coordonnées de déplacement restent identiques. `scripts/test-orc-appearance.mjs` et la QA WebGL vérifient le rendu et les attaches.

Chaque sorcière reçoit à sa création une coiffure permanente tirée de cinq styles (courte, longue, très longue, queue de cheval, deux chignons latéraux) et une des sept couleurs (noir, blond, blanc, brun, roux, gris, vert). Les tirages sont mélangés par lots pour éviter les répétitions excessives. Les coiffures utilisent les cheveux Quaternius déjà riggés, avec une variante allongée partageant sa géométrie et une petite queue de cheval attachée à l'os de tête, sans simulation physique. La coiffure longue est convertie depuis un miroir du modèle CC0, épinglé par commit et SHA-256 dans `scripts/download-costumes.sh`.

Pour un premier chargement sur mobile, `scripts/build-runtime-characters.mjs` produit des textures matérielles **WebP 1024 px**, et le déploiement publie des fichiers `.rts.glb.gz` compacts. Vérification Chrome en CI : **1 369 646 octets** pour la sorcière et **1 319 478 octets** pour l'orc, soit **2,69 Mo contre 41,68 Mo précédemment** (−93,6 %). Three.js et ses dépendances sont servis localement dans le site, sans CDN tiers. Les téléchargements sont parallèles, les requêtes ont un délai maximal et une solution de repli vers le GLB runtime non compressé, et les problèmes d'import de modules affichent un bouton de rechargement plutôt que laisser un écran bloqué. Le chargement du village orc reste différé jusqu'à la préparation des personnages.

`witch_house.glb` est un véritable modèle 3D. Les cinq types orcs (caserne, hutte, mine, chaudron et atelier) sont extraits du GLB fourni pendant la préparation du déploiement Pages, sans remplacement procédural des modèles.

## Tests

Le workflow `.github/workflows/browser-qa.yml` exécute :

- `node scripts/test-rts-navigation.mjs` : A*, collisions élargies, coins diagonaux, détours et obstacles dynamiques.
- `node scripts/test-rts-unit-physics.mjs` : préférence de séparation en terrain libre, **passage temporairement superposé** dans un corridor, réservations de **20 emplacements distincts**, dispersion progressive à l'arrêt et murs toujours solides.
- `node scripts/test-orc-strategy.mjs` : construction cohérente, stratégie économique, recrutement, défense, raiders et réinitialisation.
- `node scripts/test-rts-healing.mjs` : seuils de repos, sélection du sanctuaire, rayon et guérison plafonnée.
- `node scripts/test-rts-souls.mjs` : maison niveau 2, déblocage des Arcanistes, persistance des cadavres, réservations d'âmes et magie plafonnée.
- `node scripts/browser-qa.mjs` : vraie scène **Chrome WebGL SwiftShader**, **caméra à zoom fixe 4,05×**, **glisser à un doigt pour déplacer**, **sélection rectangulaire immédiate par deux doigts** et capture des pointeurs, séquence de **deux touches pour attaquer**, mires bleues et rouges à durée de vie limitée, stabilité des menus, production et améliorations avec vrais GLB, collisions, **destruction des bâtiments par les deux factions** et **village orc bâti automatiquement**. Le test enregistre également des captures desktop et mobile.

Un paramètre `?qa=1` active les contrôles d'injection de test `window.__fightersQA` et désactive l'IA autonome initialement pour des essais reproductibles; la partie normale active l'IA.

Le laboratoire d'animations `app/motion-lab.html` est conservé. Ouvrir le jeu via HTTPS et non en `file://`.

## Cercle de roches et magie

Une **maison de sorcières de niveau 2** est nécessaire pour ordonner la construction d'un **cercle de roches**. Tant qu'un cercle existe, ses maisons peuvent former des **Arcanistes** (rôle à distance déjà présent). Les Arcanistes peuvent alors, même en dehors du cercle, détecter les cadavres proches pendant une accalmie, s'approcher et en siphonner une seule fois l'esprit. Une fois l'animation de chute terminée, l'esprit naît comme **une copie exacte du corps 3D dans sa pose de mort** (mêmes os, géométries, position et orientation), mais entièrement blanc et semi-transparent. Cette copie s'élève, est aspirée vers l'Arcaniste et diminue progressivement de taille, accompagnée du son d'interaction. L'âme récoltée ajoute **20 points** à la jauge de magie commune (maximum **100**). La dépouille originale reste visible après la récolte jusqu'à l'expiration de sa durée normale; les squelettes temporaires de l'esprit sont libérés à la fin de l'effet.


## Potagers et nourriture des sorcières

L'ouvrière peut construire un **potager** depuis **Construire → Potager** (175 or). Chaque potager contient six parcelles. Les six parcelles cultivent uniquement du **blé**, avec **trois stades exacts** : jeune pousse, croissance, récoltable. Le **stade 3 reste en place sans mourir** jusqu'à ce que l'ouvrière le récolte. Une récolte donne huit unités de nourriture, remet la parcelle au stade 1 et démarre un nouveau cycle.

Les ouvrières peuvent être assignées par clic sur le potager ou avec la commande **Récolter**; une ouvrière libre peut aussi commencer automatiquement une récolte arrivée à maturité. Elle doit physiquement rejoindre le jardin, puis travailler avant de créditer la réserve. La consommation de nourriture dépend du nombre de sorcières vivantes. À zéro, **toutes les sorcières perdent progressivement des PV**, jusqu'à pouvoir mourir de faim. La nourriture apparaît dans la barre de ressources compacte du HUD.

## Mouvement de travail

Pendant la construction, l'extraction d'or et la récolte du blé, les ouvriers utilisent désormais un **geste de coupe continu** : les sorcières manient une faux et les orcs une hache. L'outil apparaît seulement quand l'unité travaille effectivement au contact de sa cible; elle le range pour marcher ou rester au repos. Ce mouvement réemploie l'animation native d'épée du squelette existant, distincte du coup de poing de combat, et les maillages d'outils partagent leurs géométries et matériaux entre ouvriers. Aucun GLB, texture ou nouveau squelette n'est chargé.

Les plantes utilisent maintenant les **vrais maillages et textures Sketchfab** : [Crops (low poly)](https://sketchfab.com/3d-models/crops-low-poly-637198c4b8be41e6aeaca8cea8fb81f4), de **Bumroker**, sous licence [Creative Commons Attribution 4.0 (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/). Modèle original `crops_low_poly.glb` conservé à la racine, rendu Three.js adapté (Z vers Y) et 3 variantes `Wheat_F1/F2/F3` extraites par `scripts/build-runtime-crops.mjs` au déploiement. Les stades 1→2→3 correspondent à de **vraies géométries distinctes**; le stade 3 reste mûr jusqu'à la récolte et revient au stade 1. Le pack est distribué en GLB compressé gzip et chargé en arrière-plan au début de la partie pour les arbustes et les potagers; le navigateur conserve un repli sur le GLB brut. Il partage ses géométries et textures entre toutes les parcelles, avec un rendu géométrique provisoire pendant le chargement. Les règles de nourriture et les tests sont définis dans `app/rts-farming.js`, `scripts/test-rts-farming.mjs` et `scripts/browser-qa.mjs`.

### Baies sauvages

Le même GLB renferme également les trois vraies formes `Tomatoe_F1/F2/F3`, utilisées comme **arbustes à baies sauvages**. Vingt-huit arbustes sont répartis de façon pseudo-aléatoire sur le terrain, sans chevaucher les troncs, les maisons ou les départs des unités. Ils sont traversables, ne sont jamais considérés comme des bâtiments et restent présents à maturité jusqu'à consommation. Après deux périodes de croissance de 15 secondes, une sorcière libre qui se trouve à moins de six unités peut marcher jusqu'à l'arbuste et **manger les fruits en se penchant**, avec l'animation native `Farm_Harvest` et sans outil. Chaque consommation fournit trois unités de nourriture à la réserve commune, puis l'arbuste repart au premier stade. Les ordres du joueur et le combat restent prioritaires. Les géométries sont partagées en **instances GPU par stade**; les arbustes n'allouent aucun maillage pendant les mises à jour. La nouvelle partie remet leur croissance à zéro. La distribution et les transitions sont testées dans `scripts/test-rts-berries.mjs`.
