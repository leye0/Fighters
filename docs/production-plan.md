# Fighters — plan de développement du beat’em up 3D

> **Direction approuvée par Léon le 30 octobre 2026 :** un **side-scrolling beat’em up d’action en vraie 3D**, dans l’esprit structurel de *Double Dragon*. On traverse rues, bâtiments, bacs de poubelles et toits sur plusieurs niveaux de hauteur ; on affronte plusieurs ennemis ; on avance/recul tout en se tournant vers une menace proche. Ce projet **n’est pas** un duel d’arène 1v1.
>
> **Caméra :** en zone libre, le héros est **exactement au centre de l’image** : le monde défile sur les axes écran horizontal et vertical. Lorsqu’une limite de niveau est visible (gauche, droite, haut ou bas), la caméra s’arrête sur cette frontière et le héros peut se rapprocher du bord de l’écran. Même règle aux quatre coins, en format portrait et paysage.
> 
> **Méthode :** directement sur `main`, sans PR ; architecture de production dès le départ, sans faux gameplay, sans considérer les tests de simulation comme une validation esthétique. **L’aspect des plateformes et du parcours reste volontairement minimaliste pendant tout le développement des systèmes ; leur véritable design se fera après le reste du gameplay.** Le photoréalisme reste l’objectif final, avec performance mesurée. Les décisions, clip IDs et cases de qualité doivent rester documentés.
>
> **Correction de Léon : la simplification ne concerne PAS les personnages.** À partir de maintenant, travailler avec de **vrais modèles humains 3D riggés** issus du [registre déjà établi](asset-register.md) et de [`assets/manifest.json`](../assets/manifest.json). Les capsules actuelles n'étaient que des témoins de position de simulation : elles ne valident pas le rendu, le rigging, les appuis, la locomotion ou la jouabilité. Ne plus investir dans leurs apparences ni chercher de nouveaux candidats avant d'avoir exploité les propositions déjà recensées.
>
> **Direction narrative et casting décidés par Léon :** l'histoire suit **une femme qui affronte des misogynes, proxénètes, machos et « douches »** dans un beat’em up urbain. Le joueur doit idéalement choisir entre **quatre héroïnes jouables** : **(1) femme de bureau noire, (2) femme de bureau blanche, (3) femme trans, (4) hipster engagée à gauche**. Les quatre doivent être de vrais personnages humains 3D riggés, avec identités, tenues et personnalités distinctes, mais des règles de jeu et un pipeline d'animations partagés. Ces profils sont des personnages à développer, **pas** des caractéristiques à déduire automatiquement de l'apparence de modèles téléchargés ; ne pas inventer l'ethnicité ou l'identité trans de Claudia ou Carla sans validation. Les adversaires sont caractérisés par leurs actes et attitudes, pas par une origine démographique.
>
> **Archives :** [plan historique du duel/arène](production-plan-arena-archive.md) conservé à titre de trace, mais ses rounds, six boutons imposés et règles compétitives ne dirigent plus ce produit. Voir aussi [l’architecture beat’em up](beat-em-up-architecture.md) et [la politique animation-first](animation-first.md).

## Situation actuelle — preuves et limites

| Système | Acquis vérifié | Pas encore accompli |
| --- | --- | --- |
| Source animations | **63/63 retenues par Léon**, noms, motion IDs et empreintes FBX/GLB conservés dans [la sélection](../assets/mixamo-selected.json) | Retargeting sur héros définitifs, clips en jeu, frames de contact, combos validés |
| Acquisition | 471 candidats indexés parmi 2 317 entrées ; **302 FBX acquis et 302 GLB convertis en privé** dans les travaux précédents | Les fichiers binaires ne sont pas présents dans le dépôt public ni dans l’environnement actuel |
| Modèles humains réels | **3 archives Sketchfab originales importées sur GitHub via LFS** : Claudia (63,3 Mo, 1 mesh skinné), Carla (62,4 Mo, 1 mesh skinné), Realistic Man (8,4 Mo, 3 meshes skinnés). SHA-256, attribution et licence source CC BY enregistrés. | Inspection visuelle, variantes de casting des quatre héroïnes, conversion GLB de production, retargeting et gameplay non réalisés |
| Regroupement GLB | Scripts d’acquisition ciblée + construction d’un **pack à 63 clips**, tests binaires synthétiques et identités contrôlées | Exécuter le pipeline sur les 63 vrais GLB et inspecter le résultat en 3D |
| Navigation beat’em up | Noyau déterministe `beat-em-up-world.ts` avec surfaces X/Z/Y, saut/chute, petites marches, obstacles surélevés et sélection stable des menaces ; **8 tests**. Scène de diagnostic Three.js branchée à 60 Hz, contrôles clavier/manette/tactiles | Collisions complètes, IA de navigation et combats à plusieurs |
| Caméra | `beat-scroll-camera.ts` : centrage exact hors frontières et limites sur quatre côtés ; **9 tests**. Adaptateur `beat-camera-three.ts` à PerspectiveCamera : **3 tests supplémentaires de projection NDC réelle** | Inspection sur navigateur/device du cadrage, occlusions et coins, profiling |
| Combat hérité | Simulation autoritative 1v1, coups/fenêtres, couches d’animation, IA déterministe ; **93 tests Node** avant ajout des nouveaux tests | Adapter la simulation à une troupe d’ennemis et à la profondeur, sans exposer les 71 coups synthétiques comme arsenal |
| Rendu | Three.js/Vite/WebGL, éclairage et chargement de GLB, lecteur de clips et superposition YBot expérimentale. Nouvelle page `beat-em-up.html` de navigation 3D en géométrie diagnostique | Vérification visuelle humaine de la page, héros photoréaliste, environnement final, performances sur machine réelle et animations |
| Publication | [Lecteur mobile des 63 vidéos](https://www.streamlev.com/Fighters/site/animation-review.html) et [scène 3D de diagnostic](https://www.streamlev.com/Fighters/site/beat-em-up.html) servis via GitHub Pages | Faire tester la scène par Léon sur appareil avec WebGL ; jeu complet non livré |

**Convention d’état :** « source sélectionnée » ≠ « clip GLB testé » ≠ « clip retargeté pour un héros » ≠ « coup jouable et validé ». Chaque étape conserve des preuves séparées.

## Guide de reprise pour agent externe

Ce guide est **opérationnel** : il décrit ce qui est réellement présent sur `main`, les choix de Léon qui ne doivent plus être remis en question et les premières tâches à exécuter. Les sections numérotées plus bas constituent la couverture fonctionnelle à long terme.

### Source de vérité et décisions déjà prises

1. **Dépôt :** `https://github.com/leye0/Fighters`, branche **`main`**, commits directs, pas de branche de fonctionnalité ni de PR ; lire `AGENTS.md` puis ce plan avant de coder. Vérifier le HEAD distant et l’état de la copie locale. **Une copie locale utilisée lors des premières interventions était en retard sur `main` et comportait des changements non suivis par l’historique distant** : ne jamais pousser, rebaser, écraser ou supprimer ses fichiers à l’aveugle. Partir d’un checkout frais ou réconcilier précisément les écarts.
2. **Jeu cible :** beat’em up solo 3D à scrolling, dans l’esprit de *Double Dragon*. Ce n’est plus un match 1v1 à six boutons et rounds. Une caméra 3D à prédominance latérale montre un trajet X, une profondeur Z réellement jouable et des hauteurs Y de rue, bennes, bâtiments et toits. Le héros fait face à un ennemi proche **même quand le joueur recule**. En absence de cible, il peut se tourner vers sa marche.
3. **Caméra solo :** héros **exactement centré dans l’image sur les deux axes projetés** tant que le niveau continue. Le centre caméra se bloque à la limite **gauche/droite/haut/bas** ; alors seulement le héros se déplace vers le bord de l’écran. Une limite sur X n’empêche pas le scrolling vertical, et vice-versa. **Ne pas** reprendre le cadrage historique sur le milieu de deux adversaires, ajouter une dead zone qui décale le héros ou employer un easing qui invalide constamment le centrage. Les zooms cinématiques sont des exceptions futures explicites.
4. **Géométrie temporaire :** Léon accepte **sols, boîtes et plateformes sans design détaillé** pour tester les collisions, les sauts, la caméra, les ennemis et les combats. Ces formes doivent être de vrais objets 3D cohérents avec la simulation, pas un simple décor peint. **Le design artistique des lieux est la dernière grosse phase**, après les mécanismes ; ne pas passer du temps maintenant sur des textures de rue, façades et poubelles photoréalistes.
5. **63 animations :** Léon a regardé les prévisualisations et dit **« je les ai toutes gardées, les noms sont bons »**. Les 63 sont retenues sans renommage ni élimination ; ne pas reprendre l’ancienne présélection automatique (36/25/2) pour en rejeter. `assets/mixamo-selected.json` contient exactement 63 `filename`, `motionId`, `sourceSha256`, `researchGlbSha256` et `choice: keep`. C’est la **sélection des mouvements source**, pas 63 attaques jouables ni un retargeting approuvé.
6. **Données et droits :** projet non commercial pour l’instant. Les **302 FBX/GLB Mixamo précédemment convertis** ne sont pas physiquement dans ce dépôt et ne doivent pas être supposés disponibles. **Décision explicite de Léon : les modèles humains bruts de Sketchfab peuvent être téléchargés et conservés directement dans GitHub**, y compris les archives originales via Git LFS. Ne pas leur imposer un stockage privé/temporaire par principe. Conserver source, auteur, licence CC BY effectivement vérifiée, crédits et SHA ; séparer acquisition source et approbation du personnage dans le jeu. Les droits particuliers des animations Mixamo restent un sujet distinct.
7. **Validation humaine :** jamais déclarer « animation belle », « compositing réussi » ou « jeu plaisant » sur un test de données seul. Faire une version réellement visible/jouable, puis demander à Léon de juger. `Character Lab` ou `Perception Lab` ne sont pas des passages obligatoires autonomes ; les captures outillées servent au diagnostic, pas à imposer une appréciation esthétique.

### Ce que les fichiers font vraiment aujourd’hui

| Emplacement | État réel / piège |
| --- | --- |
| `src/engine/beat-em-up-world.ts` | **Codé et branché à la scène de diagnostic** `src/beat-em-up.ts` : navigation à 60 Hz avec plateformes X/Z/Y et cible proche. **Pas encore relié aux combats de production.** |
| `src/render/beat-scroll-camera.ts`, `beat-camera-three.ts` | Calcul pur + caméra PerspectiveCamera raccordés à la scène diagnostique, dimensions dérivées FOV/aspect/pitch et centrage NDC testé. L'inspection visuelle WebGL au téléphone reste à faire. |
| `src/game/beat-stage.ts`, `src/render/beat-em-up-scene.ts`, `src/input/beat-input.ts` | Niveau et volumes 3D génériques, héros et deux ennemis diagnostiques, commandes clavier/manette/tactiles, HUD d'état et interpolation visuelle. Pas de rig ni de combat réel. |
| `src/main.ts`, `index.html` | Application de **duel 1v1 héritée** : `createMatch/stepMatch`, deux combattants et HUD d’arène. Affiche un statut d’attente si aucun modèle approuvé. **Ne pas utiliser cette page comme preuve que le beat’em up fonctionne**, ni casser ses tests sans nécessité. |
| `src/render/three-world.ts` | Renderer 1v1 existant ; `ThreeWorld.sync` suit la **moyenne X de deux combattants** et change la distance caméra. **Ce comportement est incompatible avec le scrolling solo centré.** Réutiliser ses utilitaires WebGL/matériaux si utile, mais isoler un contrôleur/renderer pour le nouveau mode. |
| `src/input/keyboard.ts` | Contrôles de duel : `vertical` est exploité pour saut/accroupissement. Le nouveau `BeatInput` sépare `horizontal`, `depth`, `jump` : il faut un adaptateur clavier/manette distinct, avec capture à chaque tick. |
| `src/game/animation-first.ts`, `assets/animation-inventory.json` | Inventaire d’attaques **vide à dessein**. Seuls des clips intégrés/retargetés, avec contacts mesurés et revue par rig, autoriseront les vrais coups. Les **71 moves** de `src/game/move-catalog.ts` sont un stress-test historique, jamais l’arsenal final. |
| `assets/manifest.json`, `src/assets/eligibility.ts` | Plusieurs personnages candidats dans le registre mais **zéro héros photoréaliste prêt au runtime** ; `runtimeRoster` les filtre. Une silhouette/capsule de **diagnostic clairement étiquetée** est acceptable dans une scène technique pour mesurer navigation/caméra, jamais comme prétendu personnage final. |
| `src/render/animation-layers.ts`, `src/animation-composite.ts` | Masques `upperBody/lowerBody` et lecteur YBot de recherche. Cinq vrais GLB ont montré des pistes techniquement composables (65 os communs, aucun conflit), **pas** une validation esthétique des pieds ou de la frappe sur un héros final. Ne pas additionner naïvement root motion et déplacement autoritatif. |
| `scripts/acquire-mixamo.py`, `scripts/convert-mixamo-fbx.py`, `scripts/prepare-selected-mixamo.py`, `scripts/pack-selected-mixamo.py` | Pipeline pour les **63 fichiers exacts**. L’assembleur ne copie qu’un rig et les données d’animations des autres GLB ; ses tests sont **synthétiques**, pas une preuve d’assemblage des 63 vrais GLB. Le convertisseur requis est `fbx2gltf@0.9.7-p1`. |
| `vite.config.ts`, `vite.review.config.ts` | Les deux builds incluent `beat-em-up.html` ; `build:review` génère aussi le lecteur des 63 animations dans `docs/site/` (avec nouveaux noms d'assets hashés). Ne pas publier une page sans régénérer l'ensemble. |
| `.github/workflows/deploy-animation-review.yml` | GitHub Actions publie **`docs/` déjà compilé**, sans exécuter Vite, et se déclenche seulement sur `docs/index.html`, `docs/site/**` ou le workflow. Les changements de TypeScript seuls **ne republient pas le site**. Préserver la prévisualisation actuelle et limiter les minutes Actions payantes. |
| `scripts/websuite.mjs`, `docs/visual-qa.md` | Automatisation WebGL/captures déjà adaptée de WarConquer. À réutiliser pour inspecter la nouvelle page, avec assertions et captures réelles. La présence d’un canvas ne démontre ni la physique ni la qualité du gameplay. |

### Jalon technique de navigation — réalisé partiellement, **personnages réels à intégrer en priorité**

**État :** le lien Web affiche la scène technique en blocs et le moteur réel de navigation/caméra. Le travail de câblage est vérifié par tests, mais **Léon refuse explicitement de considérer les capsules de diagnostic comme une avancée sur les personnages**. Le prochain effort doit viser l'acquisition/intégration de véritables humains 3D riggés, avant de qualifier la scène de gameplay jouable.

**Sources de personnages à exploiter en premier, sans relancer une recherche :** `CHAR-CAND-006` **Claudia** et `CHAR-CAND-007` **Carla** (Renderpeople, candidates aux héroïnes), `CHAR-CAND-003` **Realistic man basic rig** (J.azali, candidat ennemi), puis les autres candidats de `assets/manifest.json` selon leurs rigs et la qualité. **Les trois originaux sont maintenant dans GitHub** sous `assets/source/characters/` (Git LFS), téléchargés officiellement avec `SKETCHFAB_KEY`. Les audits `audit.json` confirment 1 skin/mesh skinné pour Claudia et Carla, et 1 skin/3 meshes skinnés pour l'homme, avec licence source CC BY et SHA-256. **Ce n'est toujours pas une validation visuelle, une conversion en GLB de production, ni un retargeting.** Claudia/Carla ne sont pas encore assignées à une héroïne précise.

- [x] Obtenir les **trois archives originales** des candidats prioritaires via l'API officielle : Claudia 63 293 838 octets, Carla 62 412 358 octets, Realistic Man 8 402 927 octets, avec crédits/licence et empreintes SHA-256 enregistrés dans GitHub ; audit glTF structurel des skins réalisé. **Ne pas confondre avec la revue visuelle**.
- [ ] Inspecter visuellement dans un vrai moteur 3D les poses, la qualité des textures, la morphologie, l'orientation et le rig de ces trois sources réelles ; choisir ensuite quels modèles servent aux héroïnes et à l'ennemi.
- [x] Ajouter l'importateur Sketchfab (`.github/workflows/import-sketchfab-character.yml` + `scripts/import-sketchfab-character.py`) avec secret `SKETCHFAB_KEY`, téléchargement officiel, audit glTF/skin/SHA-256 et **commit direct des originaux dans GitHub via LFS** avec attribution. Les **trois premières exécutions ont réussi** ; leur présence ne valide pas le gameplay.
- [x] Permettre à l'agent de déclencher l'import sans faire manipuler GitHub Actions à Léon : seul un changement de `assets/import-requests/sketchfab-character.txt` sur `main` déclenche l'Action, avec `claudia`, `carla` ou `realistic-man` ; les autres pushes ne la relancent pas.
- [ ] Charger au moins un héros **humain riggé réel** et un ennemi humain riggé réel dans la scène, aligner pieds, dimensions, origine et orientation, puis retargeter la locomotion retenue pour examiner les appuis.

- [x] Créer une page dédiée `beat-em-up.html` et son entrée TypeScript `src/beat-em-up.ts`, isolées du duel d’`index.html`.
- [x] Construire un composant de rendu Three.js `src/render/beat-em-up-scene.ts` et un niveau **piloté par données** : rue Y=0, bloc surélevé, seconde plateforme haute, limites X/Z ; noms d'objets génériques.
- [x] Créer un héros et deux ennemis de **diagnostic** via `createBeatWorld`, simulation `stepBeatWorld` à **60 ticks/s fixes** et interpolation du rendu. Les conversions X/Y/Z mm→m utilisent l'altitude absolue.
- [x] Créer une saisie `horizontal/depth/jump` séparée pour clavier, manette et contrôles tactiles, avec saut sur front d'appui.
- [x] Relier `projectBeatFocus` / `followBeatCamera` à une vraie `PerspectiveCamera`, avec dimensions de viewport issues du FOV et de l'aspect. Tests numériques de **l'alignement réel à l'écran** à plusieurs profondeurs/hauteurs/ratios ; perception visuelle à valider.
- [ ] Vérifier **quatre frontières et quatre coins** : centre exact lorsqu’on peut scroller ; à une frontière, le décor s’arrête et le héros se rapproche du bord. Tester aussi changement de profondeur, saut, hauteur de toit, fenêtre étroite et téléphone portrait. **Ne pas recentrer sur un groupe d’ennemis** au détriment du héros en solo.
- [x] Montrer la cible et l’orientation calculées : marqueur frontal 3D, recul qui conserve la cible. La rotation du vrai rig reste à valider.
- [x] Ajouter diagnostics commutables : tick, X/Z/Y, vitesse verticale, `supportingPlatformId`, `targetId`, bord(s) caméra actifs, FPS et draw calls. La page affiche son statut de diagnostic.
- [ ] Tester l’absence de traversée d’une plateforme trop haute, le saut sur le bloc, la chute depuis la plateforme haute et la liberté de marche en profondeur. **Attention :** le noyau actuel utilise des surfaces rectangulaires et le point d’appui central ; les collisions latérales complexes, sous-face, capsule du corps, pentes, rebords, interactions et IA de navigation restent des tâches distinctes. Ne pas annoncer ces capacités comme faites.
- [x] Ajouter et déployer l’entrée Pages du beat’em up **sans supprimer le lecteur des 63 vidéos**. [URL de la scène](https://www.streamlev.com/Fighters/site/beat-em-up.html) et [lecteur d'animations](https://www.streamlev.com/Fighters/site/animation-review.html) disponibles. Le navigateur de contrôle distant ne dispose pas de contexte WebGL ; **la scène n'y a pas été validée visuellement** et signale maintenant cette indisponibilité.
- [ ] Faire tester **la vraie page**, caméra et plateforme à la main par Léon, puis inscrire ses observations dans ce plan. Ne pas attendre le design final des bâtiments pour poursuivre.

**Définition révisée :** les tests d'axes/caméra et la page en blocs constituent seulement la **base technique**. Le jalon visuel jouable devra montrer un **vrai héros riggé**, pas la capsule, centré pendant le scrolling, au voisinage des quatre bords, sautant sur une plateforme, chutant, se décalant en profondeur et faisant face à un véritable ennemi 3D en reculant. Il faudra encore la validation de Léon ; les 63 animations ne sont pas intégrées simplement parce que deux rigs ont été chargés.

### Commandes de développement et vérifications à conserver

```bash
# Repartir d’un checkout synchronisé de main ; Node.js >= 24
npm ci
npm run typecheck
npm test
python3 -m unittest discover -s tests -p 'test_*.py'
npm run build
npm run dev

# Après ajout de la scène aux entrées statiques Pages :
npm run build:review
```

- Les tests de référence comprennent les anciens scénarios 1v1 (**93 tests Node avant le pivot**), **8 tests du noyau beat’em up**, **9 tests de caméra**, plus les tests Python du pack de 63 clips. Exécuter et rapporter le **total réel après checkout** ; ne pas inventer un succès CI non observé.
- **Vérification du jalon de scène diagnostique (30 octobre 2026) :** `npm run typecheck` OK, `npm test` **115/115**, Python **10/10**, `npm run build` OK, `npm run build:review` OK. `beat-three-camera.test.ts` valide numériquement le centrage de la vraie projection NDC et les quatre limites, mais aucun navigateur/GPU réel n'a encore validé visuellement le rendu dans cette session.
- Pour les 63 GLB : `python3 scripts/prepare-selected-mixamo.py --workspace /tmp/fighters-selected-mixamo` après installation du convertisseur épinglé. L’acquisition est cadencée (~5 s entre requêtes), peut prendre plusieurs minutes et doit **s’arrêter et reprendre** à la suite d’un HTTP 429 et de son `Retry-After`. **Ne pas déclencher cela à chaque build ni dans GitHub Actions**.
- Les 63 noms viennent du manifeste, **pas** d’une nouvelle sélection du modèle. Le pack `Fighters-selected-63.glb` est un YBot **de recherche** ; seul un personnage définitif avec retargeting, contacts mesurés et validation humaine alimentera `assets/animation-inventory.json`.
- GitHub Pages n’est **pas** le build principal du jeu actuellement : il sert la sélection vidéo via `docs/site` et le domaine `www.streamlev.com/Fighters`. Les modifications de docs/code sans build statique actualisé ne rendent rien de nouveau visible sur le téléphone.
- Toute case `[x]` ajoutée doit correspondre à un code exécutable, des tests et une preuve adaptée ; mettre le plan à jour **dans le même commit direct sur `main`**. Ne pas utiliser les résultats de rendu des GLB synthétiques comme validation visuelle de vrais personnages.

## 0. Gouvernance et architecture globale

- [x] Travailler directement sur `main` et conserver l’historique Git.
- [x] Établir la sélection officielle des 63 mouvements sources.
- [x] Enregistrer la direction beat’em up 3D et la règle de centrage caméra aux frontières.
- [ ] Finaliser les contrats de modules : niveau, volume, plateformes, héros, ennemi, groupe, prop, animation, coup, événement, input, caméra et replay.
- [ ] Mettre à jour les contrats et noms hérités de l’arène 1v1 sans effacer les bancs de simulation historiques.
- [ ] Garantir une simulation autoritative à **60 ticks/s**, séparée du rendu WebGL, de l’audio et de la détection visuelle.
- [ ] Décider des conventions de versions de données et de migrations des niveaux/combattants.
- [ ] Définir politiques de mémoire, streaming, cache, chargement et retrait des segments 3D.
- [ ] Maintenir AGENTS.md, ce plan, les décisions d’architecture et les preuves de QA dans les commits associés.

## 1. Géographie 3D et déplacement du héros

**Repère :** X = progression horizontale dans le niveau ; Z = profondeur réellement navigable ; Y = hauteur réelle d’appui, saut et chute. Les trois sont simulés en millimètres entiers, puis affichés en mètres.

- [x] Définir des plateformes génériques avec identifiants, empreintes X/Z et altitude de surface Y.
- [x] Avancer/reculer, se décaler en profondeur, normaliser la marche diagonale, sauter et retomber de manière reproductible.
- [x] Bloquer la marche directe contre une surface trop haute ; autoriser une petite marche de type bordure de trottoir.
- [x] Permettre de sauter sur un bac élevé et de tomber d’un toit sans téléportation (tests de noyau).
- [ ] Intégrer ces déplacements aux vrais contrôles clavier et manette du jeu.
- [ ] Implémenter capsules/volumes de collisions 3D avec les flancs de bâtiments, bennes et murs, sans traversée latérale ni diagonale.
- [ ] Gérer les surfaces de pentes, escaliers, corniches, passages dessous, toits avec surplomb et atterrissages à cheval sur deux surfaces.
- [ ] Décider les traversées de grandes hauteurs : sauts, rebords saisissables, escalade, échelles et franchissement contextuel **selon les animations disponibles**.
- [ ] Éviter les glissements de pieds, les rotations instantanées du corps et la double application du root motion.
- [ ] Assurer les collisions et trajectoires à 30/60/120 FPS d’affichage sans changer les résultats de la simulation 60 Hz.
- [ ] Ajouter une vue de diagnostic des plateformes, altitudes, capsule, vélocité et support en cours.

## 2. Camera latérale 3D et frontières du scrolling

**Règle non négociable :** la caméra suit le héros et le laisse au **centre de l’écran en permanence** tant qu’elle peut défiler. Près des frontières d’un niveau, **la caméra s’immobilise sur la limite** et le héros continue vers le bord. La composante verticale de l’écran peut résulter de la profondeur Z **et** de la hauteur Y en perspective oblique.

- [x] Définir et tester le suivi exact au centre sur les deux axes projetés de l’image.
- [x] Borner indépendamment la caméra à gauche, à droite, en haut et en bas, y compris les quatre coins.
- [x] Adapter le cadrage aux dimensions du viewport ; une petite pièce complètement visible ne fait pas défiler la caméra.
- [x] Définir une projection logique de la profondeur et de la hauteur vers l’axe vertical de suivi.
- [ ] Brancher `beat-scroll-camera.ts` à la `PerspectiveCamera` Three.js et calculer des bornes visibles exactes à partir de sa focale/perspective.
- [ ] Définir les limites de scrolling par section de niveau et la transition continue entre sections.
- [ ] Garantir le héros au centre **réel de l’image**, sur téléphones en portrait et écrans larges, sans latence d’easing cachée.
- [ ] Gérer obstacles au premier plan, occlusion et transparence contextuelle sans cacher le héros.
- [ ] Prévoir les variations de zoom/hauteur pour boss et séquences, seulement lorsqu’elles sont explicitement autorisées et sans perdre les repères.
- [ ] Tester le rendu/recadrage au franchissement des limites haut/bas lorsque le héros grimpe ou change de voie en profondeur.
- [ ] Mesurer jitter, visibilité des ennemis, caméra aux coins, saut et changement d’écran à cadence variable.
- [ ] Définir une règle **distincte** pour la coopération si deux héros s’éloignent trop ; le solo conserve le centrage strict.

## 3. Orientation, ciblage et lecture des ennemis

- [x] Séparer la direction du déplacement de celle du regard/combat dans l’état autoritatif.
- [x] Détecter un ennemi vivant proche dans le plan X/Z et à une hauteur compatible.
- [x] Conserver une cible tant qu’elle reste dans un rayon de sortie plus large que le rayon d’acquisition ; pas de basculement à chaque frame.
- [x] Choisir une cible de façon stable avec plusieurs ennemis équidistants et cesser de cibler un ennemi vaincu.
- [x] Reculer sans tourner le dos à l’adversaire proche (test déterministe).
- [ ] Rendre en **3D** l’orientation du torse et des pieds vers la cible, avec rotations continues et raccords d’animation naturels.
- [ ] Adapter ciblage et orientation aux adversaires situés devant/derrière mais décalés en profondeur.
- [ ] Ne pas cibler à travers un mur, une plateforme opaque ou une séparation de hauteur infranchissable.
- [ ] Relier attaques, projections, garde et hitboxes à l’orientation autoritative, sans auto-frappe ni coup garanti.
- [ ] Prévoir priorités de menace, cible explicitement choisie et changements de cible volontaires si nécessaires au gameplay.

## 4. Combat beat’em up à plusieurs adversaires

- [ ] Définir la structure d’état `Hero + N enemies + props` sans limite arbitraire à deux combattants.
- [ ] Porter les contacts, volumes de frappe, protection, portée, recul, stun et coups en X/Z/Y.
- [ ] Gérer collisions entre plusieurs capsules, séparation des groupes et chevauchements lors des mêlées.
- [ ] Définir les commandes à partir du **catalogue réel d’animations** : poings, pieds, coups directionnels, prises, attaques en saut et mouvements spéciaux seulement si animés.
- [ ] Préserver déplacements avant/arrière et sauts pendant les frappes compatibles par configuration des couches d’os, sans imposer le mélange à tous les coups.
- [ ] Mesurer les phases startup/contact/recovery des GLB retargetés et synchroniser l’application des dégâts à 60 Hz.
- [ ] Implémenter enchaînements, cancels et combos fondés sur transitions réellement visionnées.
- [ ] Gérer hitstop, pushback, hitstun, chutes, relèves, projections et possibilité d’être attaqué par plusieurs ennemis.
- [ ] Choisir réactions défensives et règles d’invulnérabilité selon l’action, les attaques aériennes et les dangers d’environnement.
- [ ] Gérer coups sur adversaires à plusieurs altitudes et en profondeur, sans toucher une cible hors de la vraie trajectoire.
- [ ] Intégrer le combat à la caméra, au HUD, aux effets et au rendu sans que le squelette décide la collision.
- [ ] Mesurer à cadence réelle l’impact des coups, la lisibilité et la variété des gestes avec Léon.

## 5. Bibliothèque d’animation et intégration réelle

- [x] Identifier **471 clips Mixamo** dans un catalogue documenté ; acquérir/converter **302 FBX → GLB** en privé lors des travaux de recherche.
- [x] Présélectionner 60 motions complémentaires puis ajouter trois pas arrière.
- [x] Obtenir la décision de Léon sur les vidéos : **les 63 sont conservées**, noms exacts.
- [x] Conserver les motion IDs et SHA-256 source et GLB dans [le manifeste officiel](../assets/mixamo-selected.json).
- [x] Tester structurellement cinq véritables GLB YBot pour les couches garde/marche/recul/saut + jab (pas une certification visuelle).
- [x] Créer un assembleur qui conserve une seule géométrie/rig de base et greffe 63 animations nommées, avec contrôle d’empreinte et hiérarchie d’os ; tests synthétiques.
- [x] Créer une commande de pipeline reproductible pour acquisition, conversion et assemblage des 63 clips.
- [ ] Exécuter le pipeline complet sur les **63 véritables GLB**, vérifier chaque checksum, nombre de clips, canaux, poids, timings et rendu.
- [ ] Vérifier chaque clip dans son GLB de recherche sous plusieurs angles et vitesses sur un rig YBot.
- [ ] Disposer d’un héros et d’ennemis 3D photoréalistes, riggés et proportionnés.
- [ ] Retargeter les 63 clips sur chaque rig retenu : bassin, mains, épaules, jambes, doigts, pieds, proportions féminines et masculines.
- [ ] Normaliser les clips de locomotion, garde, coups, chute, transitions et remontée en conservant les gestes reconnaissables.
- [ ] Évaluer chaque combinaison haut/bas du corps : avancer/frapper, reculer/frapper, sauter/frapper ; éviter glissements de pieds et bras irréalistes.
- [ ] Classer les sources par intention **constatée**, rôle de jeu, niveau de frappe, durée et contraintes de corps.
- [ ] Mesurer les frames de contact, l’anticipation, l’impact et le recovery du clip définitif.
- [ ] Générer les commandes et les combos à partir de ce qui est visuellement convaincant, et non depuis les 71 coups de simulation.
- [ ] Construire les packs d’animation optimisés par personnage, caches, chargement différé, déduplication et vérification du nom exact au runtime.
- [ ] Marquer chaque clip par personnage comme approuvé uniquement après validation humaine du rendu ; inventaire `assets/animation-inventory.json`.
- [ ] Prévoir les mouvements encore manquants pour les niveaux (escalade, objet, chute de toit, etc.) et les rechercher **seulement quand le besoin concret est démontré**.

## 6. Niveaux, plateformes et parcours fonctionnels (décor minimaliste)

**Choix de Léon :** pour le moment, toutes les surfaces et tous les obstacles peuvent être affichés comme des **volumes simples, couleurs neutres et silhouettes sans texture**. Cette géométrie sert à tester les parcours, le cadrage, les hauteurs et les combats. **Le design visuel de la rue, du bâtiment et des bacs sera fait après les autres systèmes du jeu**, pas pendant la construction de leur logique. Une boîte temporaire peut représenter une benne, mais sa collision et son comportement doivent être réels et génériques.

- [ ] Concevoir les données de section : géométrie, surfaces praticables, obstacles solides, zone caméra, entrée/sortie, triggers, spawns, props, éclairage et audio.
- [ ] Créer un premier parcours **minimaliste mais réellement traversable** : sol plat → bloc surélevé → accès à une hauteur de bâtiment → toit → retour au sol ; géométrie simple, collisions correctes.
- [ ] Décrire par données et tester d’autres sections **fonctionnelles en blocs** : intérieur, ruelle, passage étroit, parking, escalier et toit. Les apparences architecturales détaillées attendent la fin.
- [ ] Faire coïncider collisions de gameplay et formes visuelles, y compris sous et sur les plateformes.
- [ ] Implémenter le passage entre sections avec scrolling sans saut de caméra ni perte des états des acteurs.
- [ ] Ajouter décors destructibles et objets pouvant modifier le parcours seulement via simulation.
- [ ] Concevoir profondeur, parallaxe réelle, zones d’ombre, transparence d’occlusion et lisibilité des silhouettes.
- [ ] **Phase finale seulement :** habiller les sections déjà jouables en lieux urbains crédibles avec matériaux PBR, salissures, déchets, façades, mobilier et détails photoréalistes.
- [ ] Construire streaming/culling de niveaux sans charge mémoire démesurée ni stutter à l’arrivée d’une vague.
- [ ] Tester routes alternatives, impasses, softlocks, chutes entre plateformes et plateformes inaccessibles.

## 7. IA de groupes et progression des vagues

- [ ] Programmer perception et poursuite déterministes sur les trois axes, en tenant compte des plateformes et passages.
- [ ] Définir navigation des ennemis par graphes de surfaces et liaisons (marcher, sauter, descendre, grimper) sans tricher.
- [ ] Empêcher regroupements absurdes, tremblements, traversées et encerclements sans espace.
- [ ] Gérer rôles de groupe : harcèlement, approche, recul, contournement, garde, saisie et attaque différée.
- [ ] Définir apparition de vagues, renforts, limites temporaires de section, validation de fin de vague et déverrouillage de sortie.
- [ ] Créer ennemis aux styles et morphologies variés avec animations et portées réelles.
- [ ] Ajouter boss et comportements lisibles dont les attaques ont de vraies séquences d’anticipation.
- [ ] Conserver des réactions au joueur crédibles mais non omniscientes, avec difficultés progressives.
- [ ] Ajouter bancs de rencontres héros + groupes (au moins trois ennemis), graines fixes, replays, mesures de rythme et détection d’inactivité.
- [ ] Faire observer un combat complet à vitesse réelle par Léon avant de considérer l’IA plaisante.

## 8. Interactions, objets et armes

- [ ] Définir l’interface générique d’objet : saisir, lâcher, ramasser, jeter, frapper, pousser, escalader si applicable.
- [ ] Réutiliser les conventions d’interaction d’objets sans coder une exception par poubelle, bâton, caisse ou arme.
- [ ] Gérer position, orientation, collision et ownership des objets indépendamment des animations visuelles.
- [ ] Mesurer et attacher prises aux mains sur les rigs finaux, avec transition et IK validés.
- [ ] Implémenter une famille d’armes et d’objets de décor lorsque les animations compatibles existent.
- [ ] Gérer collisions d’armes, portée, impact, durée de vie, chute, interaction avec surfaces et ennemis.
- [ ] Prévoir inventaire léger, interactions contextuelles et indication claire au joueur.
- [ ] Tester les transitions acteur–objet en multi-ennemis, plateformes et scrolling.

## 9. Contrôles et sensation de mouvement

- [ ] Définir clavier/manettes pour gauche, droite, profondeur, saut, attaques, prises, esquive et interaction.
- [ ] Séparer saut, direction en profondeur et accroupissement ; aucune ambiguïté de commande.
- [ ] Définir remappage, répétition, buffer d’input, priorité des gestes et synchronisation à 60 Hz.
- [ ] Permettre marche arrière tout en gardant l’ennemi en face ; animer les appuis correctement.
- [ ] Gérer dash, changement de cible, attaque combinée et commandes contextuelles depuis les animations disponibles.
- [ ] Ajouter contrôles tactiles si un mode mobile jouable est retenu ; ne pas imposer un pad virtuel médiocre.
- [ ] Prévoir coopération locale avec commandes indépendantes et contraintes de caméra documentées.
- [ ] Vérifier réactivité, latence clavier/manette, diagonales, invalidations d’entrée et perte de focus.

## 10. Personnages, rigging et photoréalisme

- [x] Fixer la direction du casting : **quatre héroïnes adultes sélectionnables** (bureau noire, bureau blanche, femme trans, hipster de gauche), contre des adversaires masculins misogynes/proxénètes/machos/douches. Ne pas confondre ce choix artistique avec l'attribution effective d'un asset.
- [ ] Définir noms, biographies, silhouettes, tenues, voix, motivations et personnalité de chacune des quatre héroïnes ; leur identité de femme trans doit être établie par l'écriture et le casting, pas présumée à partir d'un mesh.
- [ ] Trouver ou constituer **quatre modèles humains féminins distincts**, photoréalistes et riggés. Examiner d'abord le catalogue existant et les deux Renderpeople acquis, puis seulement compléter les rôles réellement manquants.
- [ ] Configurer chacune des quatre sur une base de locomotion/combat commune, avec retargeting, proportion, contacts et réglages visuels individuels (aucune pénalité mécanique liée à l'identité).
- [ ] Décliner plusieurs archétypes ennemis par comportements, vêtements, dialogues et animations (macho, proxénète, harceleur, douche), sans identité démographique comme marqueur de méchanceté.
- [ ] Définir le style original des héros/ennemis : anatomie, identité, vêtements, cheveux, peaux, yeux et visages réalistes.
- [ ] Sélectionner des humains riggés avec preuve d’autorisation d’utilisation et de distribution selon la destination du jeu.
- [ ] Normaliser rig et poses de référence entre personnages, sans déformer les proportions.
- [ ] Vérifier déplacements de bassin, pieds et épaules sur toutes les morphologies, dont personnages féminins.
- [ ] Optimiser textures, normales, mesh LOD, skins et nombre de bones sans perdre le rendu Ultra.
- [ ] Ajouter personnages variés, réactions faciales et vêtements crédibles en animation.
- [ ] Établir revue visuelle de chaque clip et des mélanges sur personnages définitifs.
- [ ] Mesurer temps de chargement, draw calls, GPU, VRAM, skinning CPU/GPU et qualité des personnages à distance de caméra réelle.

## 11. Éclairage, VFX et réalisation

Pendant les essais de parcours, utiliser **un éclairage simple et lisible**. La réalisation photoréaliste des décors et des plateformes appartient à la phase d’habillage finale ; les FX de combat essentiels peuvent avancer plus tôt.

- [ ] Définir éclairage cinématographique cohérent avec niveaux urbains, intérieurs et extérieurs.
- [ ] Gérer ombres crédibles et contacts aux pieds sur les différentes hauteurs.
- [ ] Ajouter FX d’impact, éclats, poussière, vêtements, secousses et hitstop sans cacher la lisibilité des attaques.
- [ ] Ajouter météo et atmosphère : brume, pluie, vapeur, reflets et lumière nocturne lorsque pertinents.
- [ ] Gérer transparence et découpe des obstacles devant la caméra sans disparition intempestive.
- [ ] Prévoir ralentis et effets de boss avec synchronisation au temps du moteur.
- [ ] Mesurer simultanément qualité d’image et cadence, sans diminuer silencieusement la cible visuelle.

## 12. Audio et musique

- [ ] Préparer identité sonore originale : pas, saut, chutes, impacts, armes, vêtements, décors.
- [ ] Spatialisations 3D adaptées au scrolling et au voisinage des ennemis.
- [ ] Créer couches musicales par section et intensité de combat, transitions sans coupure.
- [ ] Définir mixage, compression minimale contrôlée, voix, volume, options de réduction.
- [ ] Synchroniser impacts et contacts avec frames réelles et événements de simulation.
- [ ] Gérer variation des matériaux de surface (asphalte, métal, toiture) et réverbération.
- [ ] Tester restitution mobile/casque/enceintes et performance audio.

## 13. Interface et progression de campagne

- [ ] Créer une sélection **réelle** entre les quatre héroïnes, qui charge leur modèle/rig/portrait, conserve le choix dans la partie et ne présente aucun personnage temporaire comme définitif.
- [ ] Concevoir HUD lisible : santé, ressources, ennemis, progression, arme/objet, objectifs et indicateurs contextuels.
- [ ] Créer écran titre, choix du héros, début de niveau, pause, reprises, fin de section et victoire/défaite.
- [ ] Définir progression, sauvegarde locale versionnée, checkpoints et difficulté.
- [ ] Créer mini-tutoriel jouable pour profondeur, franchissement d’obstacles, orientation vers ennemi et combos.
- [ ] Gérer informations d’interaction sans encombrer le centre d’un écran mobile.
- [ ] Assurer localisation français/anglais et interface accessible.
- [ ] Tester HUD et textes sur ratios extrêmes avec caméra centrée et frontières.

## 14. Modes, coopération et réseau

- [ ] Campagne solo complète : niveaux, vagues, progression, reprises et boss.
- [ ] Prévoir coopération locale si deux héros photoréalistes et la caméra multi-cible restent lisibles.
- [ ] Définir une politique de caméra pour deux héros qui divergent, distincte du suivi solo strict.
- [ ] Garder un mode entraînement de simulation et de visualisation des coups réels.
- [ ] Conserver le simulateur 1v1 comme outil de développement ; versus optionnel, non prioritaire.
- [ ] Évaluer jeu coop réseau sur inputs/ticks, replays, synchronisation de vagues, objets, plateformes et caméra.
- [ ] Si réseau livré : développer reconnexion, contrôle de latence, sécurité, anti-desync et tests multi-clients.

## 15. Rendu WebGL et performances

- [x] Base TypeScript/Vite/Three.js/WebGL 2 et profil Ultra/High/Medium/Low préparés.
- [ ] Définir matrices GPU/navigateurs et cibles 60 FPS sur machines de référence.
- [ ] Ajouter métriques de CPU, GPU, frametime, VRAM, draw calls, triangles, ticks et retards d’entrée.
- [ ] Tester frustum culling, occlusion, instancing, LOD et streaming d’un parcours long.
- [ ] Optimiser le coût d’une troupe d’ennemis avec 63 clips sources, sans créer 63 copies de chaque mesh.
- [ ] Gérer création/destruction d’assets et ressources WebGL sans fuite.
- [ ] Vérifier profils Ultra (beau) et Low (fonctionnel), et une vraie qualité de rendu à vitesse réelle.
- [ ] Évaluer WebGPU seulement derrière un adaptateur après mesures comparatives.

## 16. Robustesse, données et accessibilité

- [ ] Construire manifests typés pour scènes, plateformes, objets, personnages, moves, animations et triggers.
- [ ] Sauvegarder/rejouer l’état complet : acteurs, cibles, plateformes, ennemis, vagues, objets et progression.
- [ ] Empêcher les états impossibles : acteurs enterrés dans le décor, hauteurs erronées, cible inexistante, glissements et softlocks.
- [ ] Mettre en place journal d’événements typés, mesure des erreurs et diagnostics.
- [ ] Offrir remappage clavier/manette, taille du texte, réduction flashes/shake, contraste et commandes assistées explicites.
- [ ] Proposer réglages de qualité transparents et non trompeurs.
- [ ] Gérer latence et perte de focus sans corrompre la simulation.

## 17. QA, tests et validation visuelle

- [x] Base de tests Node du simulateur 1v1 existant et lancée sans régression (93 tests avant les nouveaux modules).
- [x] Tests de navigation beat’em up : appuis, saut, benne, toit, recul face à ennemi, sélection stable et déterminisme (**8**).
- [x] Tests de caméra logique : centrage, quatre frontières, coins, petite scène, ratio de viewport et projection 3D (**9**).
- [x] Tests synthétiques de pack GLB : 63 noms, canaux, correspondance du rig, mauvais SHA et refus de sources invalides.
- [ ] Exécuter les nouvelles suites et la vérification TS sur le **commit complet** dans un environnement synchronisé, puis établir une référence CI compacte.
- [ ] Tester en vrai les 63 GLB chargés et leur réutilisation sur un seul rig, sans juger la beauté sur les seules données.
- [ ] Vérifier collisions 3D, camera aux frontières et rendu WebGL avec WebSuite adapté, pas via un Perception Lab autonome.
- [ ] Vérifier cadence simulation à 60 Hz sous 30/60/120 FPS d’affichage, replay identique à graine identique.
- [ ] Faire des captures et vidéos de situations concrètes : saut sur benne, descente de toit, recul face à ennemi, troupe d’ennemis, scrolling aux quatre limites.
- [ ] Demander à Léon de juger les animations et le ressenti du combat à vitesse réelle.
- [ ] Maintenir jeux de tests de régression, budget FPS, charge GPU/CPU et profils de navigateur.
- [ ] Ne jamais cocher « rendu photoréaliste validé » ni « gameplay complet » sans inspection réelle du produit.

## 18. Asset registry, exploitation et publication

- [ ] Maintenir provenance et SHA des assets, modèle, auteurs, formats et statuts d’usage dans les manifests.
- [ ] Conserver sources acquises et pack privé séparés du dépôt Git public tant que leur distribution n’est pas clarifiée.
- [ ] Décider de la licence du **code original** et des règles pour les assets tiers.
- [x] Publier via GitHub Pages le lecteur mobile léger des 63 prévisualisations, avec workflow Actions ciblé et peu coûteux.
- [ ] Définir processus de livraison du vrai jeu : assets optimisés, cache, budgets réseau, stockage, CDN et version des clips.
- [ ] Définir tests automatiques ciblés avant publication, sans surcoûts inutiles de GitHub Actions.
- [ ] Mesurer chargement initial, erreurs réseau, reprise, sécurité et compatibilité navigateur.
- [ ] Maintenir documentation d’installation, diagnostic et progression de production.

## 19. Ordre de travail par dépendances (sans réduire la vision)

1. **Parcours gris/boîtes + caméra :** raccorder le nouveau noyau X/Z/Y et la caméra centrée/bornée à Three.js ; traversée continue du sol, d’un bloc/benne et d’une hauteur de bâtiment **sans travail de décor artistique**. **Voir le [guide de reprise ci-dessus](#guide-de-reprise-pour-agent-externe) pour les fichiers exacts, les pièges et les critères de test.**
2. **Source d’animations :** réacquérir/valider les 63 sources exactes ; tester l’assembleur sur les GLB réels et constater les 63 noms/canaux.
3. **Héros réaliste :** choisir/rigguer les modèles, retargeter locomotion/saut/idle, contrôler pieds, bassin et transitions.
4. **Ennemis en groupe :** déplacer plusieurs acteurs dans la scène, cibler avec hystérésis, navigation simple entre surfaces, puis collisions multi-ennemis.
5. **Attaques animées :** retargeter les gestes de frappe, mesurer les frames, autoriser les mélanges vérifiés, construire coups et combos depuis les clips.
6. **Parcours et interactions :** collisions complexes, armes/objets génériques, vagues, boss, portes et transitions de sections, toujours sur décor minimaliste.
7. **Fonctions de jeu complètes :** combats, héros/ennemis, progression, HUD, FX de frappe, audio, sauvegarde, accessibilité et optimisation.
8. **Validation fonctionnelle :** évaluation humaine des déplacements et combats, profiling CPU/GPU, E2E et régressions sur ces surfaces simples.
9. **Design visuel des lieux — après le reste :** transformer enfin les blocs, sols, bacs et bâtiments en décors urbains détaillés photoréalistes, sans changer leurs règles de collision.
10. **Validation finale/publication :** rendu/performance réévalués après habillage, tests de production et livraison.

Ces étapes sont des **dépendances techniques**, pas des prétextes pour livrer un jeu simplifié en déclarant le reste abandonné.

## 20. Définition de « terminé »

**Un parcours au graphisme minimaliste peut être pleinement valide comme banc de gameplay**, mais jamais présenté comme le décor final. L’habillage visuel de l’environnement reste une exigence de la version achevée et commence **après** les autres systèmes.

- [ ] Un héros 3D photoréaliste traverse un **vrai niveau** avec rue, obstacle surélevé et toit accessibles, sans bugs de collision.
- [ ] Le héros reste **au centre de l’écran** pendant le scrolling et peut atteindre les bords de l’image seulement quand la caméra a atteint les frontières gauche/droite/haut/bas.
- [ ] Plusieurs ennemis 3D poursuivent, encerclent et frappent dans le même niveau ; le héros peut **reculer en leur faisant face**.
- [ ] Toutes les attaques réellement jouables proviennent de clips acquis, retargetés, mesurés et approuvés par personnage.
- [ ] Les collisions, dégâts, parcours et événements sont déterministes à 60 ticks/s et rejouables.
- [ ] Les transitions, les pieds au sol, les sauts et les mélanges marche/frappe sont convaincants à vitesse réelle selon l’avis de Léon.
- [ ] Le rendu photoréaliste conserve ses matériaux, ombres, effets et lisibilité sous les objectifs FPS publiés.
- [ ] Le joueur peut terminer une section, un combat de groupe, un boss et un niveau ; l’expérience conserve sa progression.
- [ ] Les menus, audio, accessibilité et commandes annoncés fonctionnent sur navigateurs officiellement pris en charge.
- [ ] Le build de production est vérifié par tests, captures/vidéos et validation humaine, avec provenance des ressources distribuées.

**État global au 30 octobre 2026 :** moteurs et sources de recherche solides ; **le vrai beat’em up 3D n’est pas encore jouable**. La priorité immédiate est de raccorder navigation, caméra et personnage à une scène réelle, puis d’intégrer les 63 animations retenues.
