# Fighters — plan de production détaillé

> **Statut :** feuille de route active. Chaque case désigne un livrable concret à vérifier avant de la cocher. Le code de rendu Three.js/Vite et WebSuite adapté a été préparé ; aucun rendu photoréaliste de combattants n'est encore considéré validé tant que le build et les modèles licenciés ne sont pas testés.
>
> **Diffusion actuelle :** Fighters est un projet **non commercial pour le moment**. Son dépôt reste public, donc la republication des fichiers tiers doit malgré tout respecter leurs conditions. Une éventuelle commercialisation future exigera une nouvelle vérification des droits.
>
> **Directives du projet :** dépôt **public**, travail **directement sur main**, **aucune PR**, **aucune branche de fonctionnalité**, **aucun MVP** ni prototype jetable. Le produit est conçu en architecture de production dès la première ligne ; les tâches restent ordonnées par dépendances techniques. On ne coche jamais une tâche sur une simple intention.
>
> **Ambition :** jeu de combat arcade **2,5D**, à défilement latéral, avec personnages et décors **3D photoréalistes**, rendu sur navigateur Web, combats nerveux, HUD et ergonomie inspirés des conventions du genre sans reproduire la propriété intellectuelle d'un jeu existant.

**Deux critères inséparables :** (1) **puissance de combat et fluidité** (simulation 60 Hz et FPS mesurés), (2) **finesse photoréaliste** (personnages, peau, matériaux, lumière et décors). Aucun compromis silencieux entre les deux : profils graphiques explicites et mesure par machine de référence.

## 0. Gouvernance et définition de terminé

- [x] Créer le dépôt **leye0/Fighters**, public, avec **main** comme branche par défaut.
- [x] Établir le principe de travail direct sur **main**, sans pull request.
- [ ] Établir une licence pour **notre code** et distinguer explicitement les licences des ressources tierces.
- [ ] Créer une structure de dépôt claire : application, simulation, rendu, données, outils, tests, documentation et manifestes d'assets.
- [ ] Établir les conventions TypeScript, formatage, lint, imports, typage strict et règles d'architecture.
- [ ] Définir un processus de commits atomiques sur main, avec validation **avant** chaque push.
- [ ] Documenter les exigences non négociables : simulation déterministe, absence de fichiers tiers non redistribuables dans Git, stabilité navigateur, qualité de production.
- [ ] Configurer des vérifications automatiques rapides (typecheck, lint, tests pertinents, build), avec gestion des coûts GitHub Actions.
- [ ] Définir « terminé » : implémenté, testé, performant, rendu vérifié, licence justifiée, documenté, accessible.
- [ ] Ajouter les décisions d'architecture (ADR) avec motif, alternatives et date.
- [ ] Ne jamais laisser un faux mécanisme de jeu, un modèle de remplacement ou une animation trompeuse être présenté comme une fonction terminée.
- [ ] Maintenir ce fichier et le registre d'assets au fil des commits.

## 1. Vision, expérience et contraintes

- [ ] Formaliser le style visuel : réalisme cinématographique, anatomie crédible, peau, tissus, éclairages et environnements à échelle humaine.
- [ ] Établir un langage visuel original pour les personnages, arènes, icônes, logos et interface.
- [ ] Définir l'aire de jeu 2,5D : combattants confinés à un plan horizontal, déplacements et sauts, profondeur 3D purement visuelle.
- [ ] Préciser la distance caméra, le cadrage des combattants et l'échelle des arènes sur formats d'écran variés.
- [ ] Fixer les objectifs de réponse : simulation à **60 ticks/s**, commande ressentie sans latence inutile et affichage cible **60 FPS**.
- [ ] Définir les machines/navigateurs pris en charge, avec qualité graphique adaptative et seuil d'entrée explicite.
- [ ] Définir les systèmes de difficulté, d'équilibrage et les options compétitives.
- [ ] Définir les règles de contenu : violence arcade stylisée dans les réactions, sans exigence de gore ; options de réduction des effets.
- [ ] Définir la liste évolutive de combattants et arènes ; aucun plafond artificiel de roster.
- [ ] Rédiger des critères d'acceptation jouables pour chaque grande fonctionnalité.

## 2. Choix techniques et infrastructure

**Point de départ proposé :** TypeScript + Vite + Three.js, **WebGL 2** (l'équivalent Web d'une partie de l'écosystème OpenGL, pas OpenGL natif), modèles **glTF/GLB**, matériaux PBR. Le rendu WebGPU pourra être évalué derrière un adaptateur, sans l'imposer à tous les navigateurs.

- [ ] Initialiser l'application Vite/TypeScript en mode strict et les scripts de développement/production.
- [ ] Séparer explicitement les modules **simulation**, **input**, **combat**, **animation**, **renderer**, **audio**, **UI** et **services**.
- [ ] Définir les interfaces portables : FighterDefinition, MoveDefinition, AnimationClipRef, StageDefinition, MatchRules, InputFrame, ReplayFrame.
- [ ] Construire une boucle de simulation à pas fixe avec accumulateur et interpolation de rendu.
- [ ] Isoler l'état autoritatif de combat du moteur 3D et des animations visibles.
- [x] Utiliser des nombres/arrondis et ordres d'opérations reproductibles pour les résultats de simulation.
- [ ] Ajouter un système d'événements typés entre simulation, effets, interface et sons.
- [ ] Prévoir un système de chargement et de cache des personnages/arènes avec progression.
- [ ] Définir la politique de mémoire GPU, libération des textures, géométries et animations.
- [ ] Mettre en place feature flags pour capacités expérimentales sans les présenter comme finalisées.
- [ ] Ajouter une page de diagnostic des FPS, ticks, latence d'entrée, draw calls, triangles, mémoire et durée des chargements.
- [ ] Vérifier régulièrement les API WebGL et les restrictions WebGPU sur navigateurs réels.

## 3. Simulation de combat déterministe

- [x] Définir le repère 2,5D, limites d'arène et contraintes au sol.
- [x] Gérer deux combattants, leur position, vitesse, orientation et distance mutuelle.
- [ ] Implémenter les états : idle, marche, course/dash, saut, chute, garde, attaque, recovery, stun, projection, knockdown, relève, KO.
- [ ] Gérer la gravité, les trajectoires de saut, les collisions au sol et les sauts directionnels via règles déterministes.
- [ ] Gérer le retournement automatique selon la position relative et les transitions de côté.
- [ ] Définir les boîtes de collision : **pushbox**, **hurtbox**, **hitbox**, zone de projection et volumes spéciaux.
- [ ] Synchroniser ces volumes avec les données temporelles des coups, indépendamment des meshes visuels.
- [ ] Traiter les contacts simultanés avec une règle de priorité stable et documentée.
- [ ] Gérer la poussée, le recul, le rapprochement, l'atterrissage et la gestion du coin d'arène.
- [ ] Implémenter hitstop, hitstun, blockstun, invincibilité, armure, contre, coup aérien et recovery.
- [ ] Définir les règles d'enchaînement, cancel, juggle, wall interaction et combo scaling.
- [ ] Prévenir les collisions inversées, téléportations, traversées et glitches de face.
- [ ] Sérialiser l'état de chaque tick pour replay et synchronisation réseau.
- [x] Tester la reproduction exacte d'un combat à partir d'une suite d'entrées.
- [ ] Fournir une visualisation de debug des volumes et frames, activable hors interface normale.

## 4. Contrôles arcade et saisie

- [ ] Supporter clavier à deux joueurs sur une même machine, avec touches configurables.
- [ ] Supporter Gamepad API : manettes USB/Bluetooth, sticks, croix directionnelle et boutons.
- [ ] Définir un mapping par défaut de **6 attaques** : poings faible/moyen/fort et pieds faible/moyen/fort.
- [ ] Implémenter avant, arrière, accroupissement, diagonales, saut, dash et garde directionnelle.
- [ ] Prendre en charge les inputs relatifs à l'orientation du combattant.
- [ ] Ajouter buffer d'input en frames, tolérance des diagonales et historique des commandes.
- [ ] Détecter quart de cercle, demi-cercle, double quart de cercle, charge, double impulsion et commandes à 360°. (Quart de cercle, demi-cercle et double quart de cercle reconnus ; intégration des commandes quart de cercle et dragon-punch au moteur de combat.)
- [x] Définir des règles de priorité lorsque plusieurs mouvements spéciaux correspondent. (Priorité explicite, longueur du mouvement, ordre stable, tests.)
- [ ] Gérer répétition clavier, ghosting possible, perte de focus, pause et déconnexion de manette.
- [ ] Permettre le remappage complet des commandes et la sauvegarde des préférences.
- [ ] Ajouter un affichage d'inputs en entraînement et un outil de validation des séquences.
- [ ] Tester à 30/60/120 Hz d'affichage pour vérifier que le gameplay reste à 60 ticks/s.
- [ ] Prévoir une interface tactile dédiée si la jouabilité mobile est retenue, sans compromettre les contrôles physiques.

## 5. Coups, combos et équilibre

**Décision animation-first :** les 71 attaques de [docs/arsenal.md](arsenal.md) constituent uniquement un **banc de simulation**, pas le contenu du jeu. Les coups effectivement jouables sont **dérivés des animations réellement acquises, vues, retargetées et approuvées**, puis leurs commandes et cancels sont attribués. Voir [docs/animation-first.md](animation-first.md). Nombre de coups réellement approuvés aujourd'hui : **0**.

- [x] Définir **71 scénarios synthétiques de test du moteur** : six normaux, six accroupis, six aériens, douze directionnels, six accords de touches et 35 spéciaux/supers ; **non livrés comme arsenal réel**.
- [x] Reconnaître neuf mouvements directionnels, des accords de boutons et les priorités de sélection.
- [x] Autoriser des **combos cancel après contact** vers des coups explicitement permis, dans des fenêtres temporelles vérifiées ; refuser le cancel sur whiff.
- [x] Permettre les attaques aériennes sans figer la gravité et limiter la collision par séparation verticale.
- [ ] Compléter le buffering des accords quasi simultanés, les charges, les dash et les projections.
- [x] Mettre en place le registre **animation-first** par combattant, où seuls les clips approuvés créent un coup ; FPS/contact mesurés déterminent les frames, cancels vers clips absents filtrés et noms GLB contrôlés avant un combat. (Tests unitaires ; 7 FBX acquis temporairement hors Git, aucun clip intégré ni approuvé.)
- [x] Établir un inventaire sourcé de 103 mouvements Mixamo réels et un téléchargement privé reproductible, sans déposer de FBX brut dans le dépôt public.
- [ ] Intégrer les vrais clips de combat et valider leur qualité avec les combattants photoréalistes.
- [ ] Choisir les commandes, les catégories de coups et les combos **après** l'inspection visuelle de chaque clip acquis, et non à partir d'un catalogue hypothétique.
- [ ] Valider les transitions esthétiques entre clips retenus et ne créer des spéciaux que lorsqu'une animation convaincante existe.

- [ ] Définir les coups par données : ID, commande, animation, startup, active, recovery, dégâts, portée, hitboxes et sons.
- [ ] Définir un ensemble original de coups normaux debout, accroupis et aériens pour chaque combattant.
- [ ] Définir des attaques spéciales de profils différents : projectile, anti-air, charge, ruée, balayage et attaque aérienne.
- [ ] Implémenter les propriétés haut/milieu/bas, coups overhead et attaques impossibles à garder en l'air.
- [ ] Implémenter les projections, échappements et fenêtres de contre-projection.
- [ ] Implémenter les combos, cancel windows, chain links et extensions de combos.
- [ ] Implémenter les coups EX/renforcés et les super-attaques consommant une jauge.
- [ ] Définir les dégâts, chip damage, scaling, gain de jauge et pénalités de répétition.
- [ ] Gérer clashs, trades, coups critiques/contre, attaques interrompues et projectiles en compétition.
- [ ] Créer un affichage des frame data (startup/active/recovery/on hit/on block).
- [ ] Définir un banc de tests d'équilibrage : portée, invincibilité, avantage, cadence et punition.
- [ ] Prévoir des correctifs de données sans changer le code de simulation.
- [ ] Documenter les combinaisons de touches et commandes de chaque personnage.

## 6. Match, rounds et règles

- [ ] Implémenter sélection des combattants, position de départ et introduction d'un round.
- [ ] Implémenter barres de vie, timer, fin du temps, double KO et attribution du round.
- [ ] Gérer meilleur de trois rounds et règles configurables de nombre de rounds.
- [ ] Implémenter transitions READY, FIGHT, KO, TIME UP, résultat et revanche.
- [ ] Gérer pause locale, reprise, abandon et retour menu sans corruption d'état.
- [ ] Gérer victoire par KO, décision au temps et égalité.
- [ ] Définir persistance des paramètres de combat et règles personnalisées.
- [ ] Concevoir des scénarios d'acceptation pour toutes les fins de manche.

## 7. Pipeline de personnages photoréalistes

**Qualité visée :** personnages convaincants à distance de caméra arcade ; anatomie, yeux, peau, cheveux, vêtements et déformations crédibles. Les animations Mixamo sont une base réutilisable, mais peuvent nécessiter une retouche pour les transitions et l'impact des coups.

- [ ] Définir des critères mesurables pour accepter un personnage : topologie, textures, rig, blendshapes, licence, poids mémoire et qualité des déformations.
- [ ] Rechercher en priorité des personnages humains réalistes **libres pour usage commercial** et compatibles avec le dépôt public.
- [ ] Examiner les personnages Mixamo disponibles, et enregistrer auteur/source et restrictions.
- [ ] Rechercher des humains scannés/riggés sous CC0 ou CC BY sur Sketchfab et catalogues vérifiés.
- [ ] Évaluer MakeHuman / MPFB pour des corps et visages CC0 personnalisables.
- [ ] Rejeter les modèles « gratuits » dont la licence interdit l'usage commercial, la modification ou la redistribution nécessaire.
- [ ] Rejeter les modèles possédant des marques visibles, scans de personnes non autorisées ou droits à l'image incertains.
- [ ] Créer un roster diversifié : morphologies, visages, carnations, âges adultes, genres et styles vestimentaires crédibles.
- [ ] Établir une base technique commune pour les proportions du rig et le retargeting.
- [ ] Contrôler la direction des yeux, mâchoire, doigts, pieds et épaules.
- [ ] Vérifier les déformations épaules/hanches/genoux en poses extrêmes.
- [ ] Créer variantes de tenues et palettes uniquement lorsque droits et pipeline le permettent.
- [ ] Préparer portraits, thumbnails et représentation haute qualité pour la sélection.
- [ ] Optimiser les meshes en LOD sans sacrifier la qualité de l'image de combat.
- [ ] Mesurer taille compressée, durée de chargement, textures GPU et coût des bones par personnage.
- [ ] Maintenir une liste de candidats refusés avec raison (licence, qualité, rig, performances).

## 8. Bibliothèque Mixamo — catalogue de mouvements à acquérir

**État présent :** [70 rôles de recherche](../assets/mixamo-catalog.json) (mots-clés, sans preuve), **103 animations Mixamo réellement indexées** dans [le catalogue de clips disponibles](../assets/mixamo-available-clips.json), dont **7 FBX binaires réellement téléchargés et vérifiés dans un dossier privé hors Git**. **0 animation retargetée/intégrée et 0 coup réel jouable**. Le catalogue test du moteur reprend 34 rôles hypothétiques ; il ne prescrit pas les animations à trouver. **L'inventaire des animations réelles décide de l'arsenal**, et non l'inverse.

Le but n'est pas de télécharger aveuglément toute la bibliothèque Adobe, mais de **recenser, comparer, intégrer et retoucher toutes les animations utiles à un jeu de combat**, avec variantes quand elles existent. Chaque entrée devra avoir son identifiant Mixamo, son fichier source autorisé, son personnage/rig de référence, sa durée, ses tags et son statut de retargeting.

**État au 29 octobre 2026 : 103 animations Mixamo identifiées dans un index réel, 7 FBX téléchargés et vérifiés en privé, mais 0 clip intégré ou approuvé dans Fighters.** Le lecteur GLB/animation existe ; le retargeting et la validation visuelle restent à faire. Voir [docs/mixamo-real-sources.md](mixamo-real-sources.md) et [docs/mixamo-integration.md](mixamo-integration.md).

- [x] Recenser 103 vrais clips Mixamo à partir des index de WarConquer et vérifier en téléchargement privé 7 FBX binaires (identifiant, catégorie, frames, source, SHA-256). Voir [sources réelles](mixamo-real-sources.md).
- [ ] Regarder, retargeter, sélectionner et **valider visuellement** ces clips sur des modèles photoréalistes (hommes et femmes) avec frames d'impact mesurées. Les noms de l'index ne suffisent pas.
- [ ] Exporter légalement depuis un Adobe ID ; distinguer droit d'utilisation en jeu et droit de republier les fichiers sources dans le dépôt public.
- [ ] Retargeter sur différentes morphologies, dont au moins deux personnages féminins, et vérifier pieds, bassin, mains, transitions et timings.
- [ ] Synchroniser réellement les clips de chaque coup avec startup, active, recovery, impact et réaction du moteur.

### 8.1 Locomotion et posture


- [ ] Idle neutre et plusieurs **fighting idle** avec respiration.
- [ ] Transition vers garde et sortie de garde.
- [ ] Marche avant/arrière, strafing latéral adapté à la caméra de côté.
- [ ] Course/avancée rapide, dash avant et dash arrière.
- [ ] Pivot, demi-tour, changement de garde et repositionnement des pieds.
- [ ] Accroupissement, garde basse, transition accroupi/debout.
- [ ] Saut vertical, avant/arrière, impulsion, apex, chute et atterrissage.
- [ ] Esquive, roulade et backstep selon le style du personnage.
- [ ] Réajustements de stance et micro-déplacements in-place.

### 8.2 Coups de poing

- [ ] Jab gauche et droit ; directs légers et rapides.
- [ ] Cross / straight punch et coups moyens.
- [ ] Hooks gauche/droit et crochets au corps.
- [ ] Uppercuts gauche/droit et variantes anti-air.
- [ ] Overhand, coup descendant et smash.
- [ ] Coups de poing accroupis et en saut.
- [ ] Séries de poings, combinaisons et attaques tournantes.
- [ ] Attaque chargée, attaque à deux bras et animation spéciale si disponible.

### 8.3 Coups de pied

- [ ] Front kicks, low kicks et mid kicks.
- [ ] High kicks, roundhouse et variantes retournées.
- [ ] Side kick, back kick et spinning back kick.
- [ ] Balayages, coups au sol et sweeps.
- [ ] Jump kick, flying kick et coups de pied aériens.
- [ ] Double kick, kick combo et attaques spéciales du style de combat.

### 8.4 Défense, réactions, projections et finitions

- [ ] Block haut, bas et réaction de garde touchée.
- [ ] Dodge latérale, esquive du buste et recul.
- [ ] Hit reactions tête, tronc, abdomen, jambes, léger/fort.
- [ ] Stagger, stun, recul lourd et chute avant/arrière.
- [ ] Knockdown, impacts au sol, se relever vite/lentement.
- [ ] Clinch, grapple, throw, projection, réception et échappement.
- [ ] KO debout, chute KO et poses finales.
- [ ] Taunts, célébrations, victoire, défaite et épuisement.
- [ ] Réactions aux projectiles et coups spéciaux lorsque pertinentes.
- [ ] Tester et retenir plusieurs variantes par mouvement pour éviter l'uniformité du roster.

### 8.5 Traitement des clips

- [x] Définir un résolveur `moveId → animationRole → nom de clip du combattant`, avec override par personnage. (Tests unitaires du mapping présents ; 7 sources FBX acquises temporairement hors Git, aucune intégrée.)
- [x] Refuser la création d'un coup de production sans fiche d'animation réellement inspectée et licenciée, ou sans son clip dans le GLB ; supprimer les cancels non couverts. (Pipeline et tests unitaires ; 0 clip réel approuvé.)
- [ ] Vérifier sur de vrais GLB le time scaling, les transitions/crossfades, les impacts et les poses, en Ultra et Low. (Branchement de durée codé mais pas validé visuellement.)

- [ ] Inventorier les variantes disponibles dans Mixamo avec une table source → clip interne.
- [ ] Télécharger les clips dans une zone autorisée **hors dépôt public** si leur redistribution brute n'est pas permise.
- [ ] Harmoniser FPS, orientation, axe vertical, échelle, root motion et pose de référence.
- [ ] Couper les pauses inutiles et identifier les frames clés de contact.
- [ ] Créer transitions et animation blending sans patinage des pieds.
- [ ] Retargeter chaque clip sur le rig canonique puis les rigs des personnages.
- [ ] Créer masques corporels pour locomotion et attaque partiellement combinables.
- [ ] Ajouter IK pieds/mains et corrections de pose pour précision visuelle.
- [ ] Définir l'association animation ↔ move data ↔ hitbox timeline.
- [ ] Éditer ou créer les clips absents lorsque Mixamo ne satisfait pas le timing de combat.
- [ ] Tester tous les clips en miroir, vue de côté, avec les deux orientations.
- [ ] Produire un rapport par clip : qualité, coût, compatibilité, droits et statut.

## 9. Qualité du rendu photoréaliste

- [ ] Configurer color management, tone mapping, exposition et rendu physique cohérents.
- [ ] Utiliser matériaux PBR : albedo, normal, roughness, metalness et occlusion.
- [ ] Évaluer les techniques de diffusion sous la surface pour la peau à coût Web acceptable.
- [ ] Améliorer les yeux : cornée, iris, reflets et regard.
- [ ] Améliorer la peau : micro-normal, pores, brillance, variations et contacts lumineux.
- [ ] Améliorer cheveux/barbe/cils et transparence sans scintillement excessif.
- [ ] Gérer tissus, cuir, métal, coutures, salissures et usure réaliste.
- [ ] Définir l'éclairage trois points ou cinématique adapté à chaque arène.
- [ ] Ajouter ombres dynamiques, ombres de contact et occlusion ambiante selon le profil GPU.
- [ ] Ajouter HDRI/IBL et réflexion adaptées aux matériaux et à l'environnement.
- [ ] Évaluer bloom contrôlé, color grading, profondeur de champ très légère et motion blur limité.
- [ ] Préserver la lisibilité des attaques, silhouettes et hit sparks malgré le réalisme.
- [ ] Créer des profils Ultra / High / Medium / Low / Auto avec budgets mesurés.
- [ ] Prévenir aliasing, z-fighting, shadow acne, clipping et artefacts de transparence.
- [ ] Vérifier la fidélité de chaque combattant dans une scène de comparaison à éclairage constant.
- [ ] Créer des captures de référence à qualité Ultra (peau, cheveux, yeux, ombres, décors) avec caméra et éclairage contrôlés.
- [ ] Documenter pour chaque effet photoréaliste son coût CPU/GPU et son gain visuel à résolution identique.

## 10. Arènes 3D réalistes

- [ ] Définir le système de StageDefinition : géométrie, limites de combat, éclairages, ciel, sons, FX, arrière-plan.
- [ ] Construire le pipeline d'assemblage depuis modèles CC0, textures PBR et HDRI.
- [ ] Concevoir plusieurs thèmes originaux : rue nocturne humide, entrepôt, toit urbain, temple/cour, zone industrielle, décor naturel.
- [ ] Créer un véritable premier plan jouable avec sol, matériaux et contacts.
- [ ] Créer arrière-plan multi-profondeur pour parallaxe naturelle lors du suivi caméra.
- [ ] Ajouter éléments dynamiques : lumières, enseignes, pluie, poussière, vapeur, feuillage et foule distante si pertinent.
- [ ] Définir l'interactivité purement cosmétique de l'arène sans casser la simulation.
- [ ] Optimiser occlusion, instancing, LOD, impostors et taille des textures.
- [ ] Éviter toute géométrie traversant les combattants ou masquant les hitboxes lisibles.
- [ ] Calibrer exposition et silhouettes dans chaque scène, de jour comme de nuit.
- [ ] Définir audio ambiant et réverbération propres à chaque scène.
- [ ] Tester chaque arène sur profils GPU variés.

## 11. Caméra et mise en scène

- [ ] Construire caméra orthographique ou perspective longue focale avec cadrage latéral constant.
- [ ] Suivre le centre des combattants avec limites de scène et zoom adaptatif.
- [ ] Garantir que les deux personnages restent visibles, y compris lors de sauts et projections.
- [ ] Gérer les mouvements de caméra de KO, super-attaques et introduction sans perte de repères.
- [ ] Ajouter screenshake bref et proportionné aux impacts.
- [ ] Gérer ralenti cinématique uniquement dans les moments autorisés et synchronisés.
- [ ] Interdire que la caméra change les collisions ou l'état du combat.
- [ ] Ajouter options d'accessibilité pour réduire shake, flashes et mouvements.

## 12. FX de combat

- [ ] Créer hit sparks de plusieurs intensités et couleurs originales.
- [ ] Ajouter effets de contact : poussière, souffle, débris, condensation, particules et traînées.
- [ ] Ajouter effets de garde, contre, coup armuré, clash, super-coup et KO.
- [ ] Ajouter VFX de projectiles 3D ou shaders avec hitboxes autoritatives séparées.
- [ ] Synchroniser chaque effet avec la frame de contact, sans impact anticipé ou retardé.
- [ ] Définir niveaux de détail des FX et limiter les allocations lors du combat.
- [ ] Vérifier lisibilité des combats et absence de flashs excessifs.

## 13. HUD, menus et identité visuelle

Le HUD suit les **conventions fonctionnelles** des jeux de combat classiques (barres de vie gauche/droite, timer central, jauges, rounds), mais avec une **exécution graphique originale**.

- [ ] Créer identité graphique, typographie et palette propres à Fighters.
- [ ] Afficher noms/portraits, jauges de vie symétriques et vie différée.
- [ ] Afficher timer au centre, marques de rounds gagnés et résultat.
- [ ] Afficher jauges de puissance/super et états spéciaux.
- [ ] Afficher compteur de combo, dégâts et notifications de counter/punish.
- [ ] Produire annonces visuelles READY, FIGHT, KO, PERFECT, TIME UP, WIN.
- [ ] Animer les transitions sans retarder ou masquer la simulation.
- [ ] Créer écran d'accueil, menu principal, sélection de personnages, sélection d'arène et réglages.
- [ ] Créer écran de pause, victoire/défaite, revanche et crédits.
- [ ] Assurer la mise à l'échelle desktop, 16:9, ultrawide et petits écrans.
- [ ] Prévoir interface multilingue, français en premier et anglais ensuite.
- [ ] Tester contraste, taille de texte, navigation clavier et manette.

## 14. Audio, voix et impacts

- [ ] Définir une direction sonore originale (percussions, impacts, souffle, salle/rue).
- [ ] Acquérir des impacts poing/pied, block, chute, frottement, saut et pas sous licence approuvée.
- [ ] Acquérir/créer respirations, efforts, cris d'attaque, douleur, KO et célébration.
- [ ] Varier les sons de coups et voix selon combattant, intensité et position.
- [ ] Définir sons spéciaux, tirs/projectiles, jauges, parades, counter, victoire et sélection.
- [ ] Ajouter ambiance spatialisée de chaque arène et musiques originales ou licenciées.
- [ ] Gérer mixage musique/FX/voix/ambiance, compression légère, ducking et limitation des pics.
- [ ] Gérer latence et déblocage AudioContext après interaction utilisateur.
- [ ] Synchroniser le déclenchement au tick de contact puis à la restitution audio.
- [ ] Ajouter options de volumes séparés, sous-titres/indicateurs visuels et mode sonore réduit.
- [ ] Conserver source, auteur, licence et attribution de **chaque** clip.

## 15. Intelligence artificielle et entraînement

- [x] Définir une IA consommant les mêmes inputs et règles que les joueurs humains. (Contrôleurs déterministes via InputFrame, testés 2026-10-29.)
- [ ] Programmer profils : agressif, défensif, zoner, grappler, équilibré. (Agressif, défensif et équilibré implémentés ; zoner et grappler restent à faire.)
- [ ] Définir perception limitée, réaction configurable et prise de décision sans triche.
- [ ] Gérer défense, anti-air, punition, projection, combos et usage stratégique de jauge.
- [ ] Définir difficulté progressive par qualité décisionnelle et non par triche de dégâts.
- [ ] Ajouter mode entraînement avec dummy immobile, garde, auto-reversal et enregistrement/relecture.
- [ ] Ajouter affichage hitboxes, frame data, inputs, dégâts et avantage de frames.
- [ ] Ajouter exercices de combos et scénarios reproductibles.
- [ ] Tester l'IA contre différentes morphologies et styles de coups.
- [x] Tester plusieurs duels **IA contre IA déterministes**, avec plusieurs graines et profils, sans modifier les règles du moteur : attaques, gardes, coups spéciaux, KO et statistiques. (Tests automatisés exécutés.)
- [ ] Étendre le banc IA contre IA à au moins 30 graines et styles et mesurer durée, touches, gardes, variété, phases sans contact, équilibrage et régressions.
- [ ] Évaluer des critères observables de rythme et de plaisir : alternance offensive/défensive, lisibilité, tension, variété et absence de combats absurdes. Les métriques seules ne prouvent jamais qu'un jeu est plaisant.

## 16. Modes de jeu et progression

- [ ] Combat local Joueur contre Joueur.
- [ ] Combat Joueur contre IA et IA contre IA pour diagnostics. (IA contre IA simulée et option navigateur branchée, mais modèles animés encore absents.)
- [ ] Mode arcade avec adversaires et difficulté progressifs.
- [ ] Mode entraînement complet.
- [ ] Mode versus personnalisable et revanche rapide.
- [ ] Parcours de démonstration des commandes et tutoriels interactifs.
- [ ] Sauvegarder préférences, statistiques locales et progression sans exiger de compte.
- [ ] Prévoir classement local et historique des combats.
- [ ] Prévoir rejouabilité des combats et export/import de replays compatibles.
- [ ] Définir compatibilité future des replays face aux mises à jour d'équilibrage.

## 17. Jeu en ligne et netcode

- [ ] Définir l'architecture de synchronisation réseau sur **inputs + ticks**.
- [ ] Choisir une signalisation de session et un transport compatible navigateur (WebRTC ou relais approprié).
- [ ] Implémenter prediction, rollback, resimulation et gestion de latence.
- [ ] Prévoir protocole versionné et vérification de compatibilité des données de coups.
- [ ] Gérer reconnexion, abandon, désynchronisation et comportement en pause.
- [ ] Ajouter parties privées par code/invitation et rencontres publiques si l'infrastructure le permet.
- [ ] Définir matchmaking, régions, estimation ping et protections anti-abus.
- [ ] Éviter de divulguer les IP ou données privées au-delà des nécessités techniques.
- [ ] Instrumenter tests de latence, jitter, packet loss et comparaison d'états.
- [ ] Prévoir hébergement, budget d'exploitation et monitoring des services multijoueur.

## 18. Accessibilité et qualité de vie

- [ ] Permettre remappage intégral clavier/manette.
- [ ] Ajouter réglage sensibilité commandes, assistance optionnelle et profils d'accessibilité sans déséquilibrer le compétitif.
- [ ] Fournir indicateurs de sons importants et sous-titres des annonces.
- [ ] Permettre réduction des effets lumineux, shake et animations décoratives.
- [ ] Garantir contraste du HUD et signalement distinct des états critiques.
- [ ] Ajouter paramètres de résolution, qualité et plein écran.
- [ ] Gérer suspension de tab, perte WebGL context et retour après veille.
- [ ] Définir support navigateurs, compatibilité manettes et messages d'erreur compréhensibles.
- [ ] Prévoir chargement progressif et avertissements de taille de téléchargements.
- [ ] Vérifier navigation des menus sans souris.

## 19. Acquisition, droits et registre des ressources

**Règle :** une ressource « gratuite à utiliser » n'est pas nécessairement « libre à redistribuer dans un dépôt public ». Il faut vérifier l'URL, le titulaire, la licence précise et les droits de redistribution **avant** chaque inclusion. Ne pas confondre ressources du jeu exécuté et fichiers sources bruts publiés.

| Source | Usage envisagé | Indication de licence | Action |
| --- | --- | --- | --- |
| [Mixamo / Adobe](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html) | Animations et personnages humanoïdes | Usage dans les jeux, y compris commerciaux, autorisé ; redistribution brute à examiner | Cataloguer, vérifier les conditions et conserver les sources hors Git si nécessaire |
| [Poly Haven](https://polyhaven.com/license) | HDRI, modèles, textures photoréalistes | CC0 | Prioritaire |
| [ambientCG](https://ambientcg.com/) | Matériaux PBR | Vérifier la licence exacte de l'asset | Candidat |
| [MakeHuman](https://www.makehumancommunity.org/about/license.html) | Personnages générés et bases de morphologie | Exports et assets de base CC0 selon la documentation | Prioritaire pour personnages personnalisables |
| [Sketchfab](https://sketchfab.com/developers/download-api/guidelines) | Scans/personnages réalistes | Variable, CC0/CC BY/NC/autres | Vérification individuelle indispensable |
| [Freesound](https://freesound.org/help/faq/) | Impacts, voix, ambiances | Variable, CC0/CC BY/NC | CC0 prioritaire, CC BY avec attribution |
| Créations internes | HUD, personnages complémentaires, décors et audio | À définir pour le dépôt | Documenter auteurs et droits |

- [x] Créer **docs/asset-register.md** et un manifeste machine-readable des ressources.
- [ ] Enregistrer par ressource : ID interne, nom, auteur, URL source, date, licence/version, permission de modification, permission de redistribution, attribution.
- [ ] Enregistrer SHA-256 du téléchargement, format original, formats dérivés et chaîne de transformation.
- [ ] Séparer trois statuts : **candidat**, **licence vérifiée**, **intégré et validé**.
- [ ] N'utiliser aucun fichier avec licence inconnue, NC incompatible, droits de personnalité douteux ou attribution impossible.
- [ ] Vérifier les obligations CC BY dans les crédits embarqués et dans la documentation publique.
- [ ] Définir le stockage légal des ressources non redistribuables brutes (accès privé, pipeline contrôlé) sans exposer de secrets.
- [ ] Vérifier si et comment le package de jeu final peut contenir les ressources tierces transformées.
- [ ] Éviter de committer des archives source Mixamo par simple commodité.
- [ ] Définir les conventions de noms et métadonnées pour les animations importées.
- [ ] Créer un outil de vérification du manifeste et des fichiers avant build.
- [ ] Constituer une sélection de personnages réalistes réellement compatibles avec les contraintes : qualité > quantité, sans limite artificielle du roster.
- [ ] Documenter les ressources refusées et les raisons pour faciliter les recherches futures.

## 20. Pipeline et optimisation des assets

- [ ] Définir pipeline source → Blender/outil autorisé → glTF/GLB → compression → manifest.
- [ ] Définir standards des rigs, bones, animation names, unités, orientation et transforms.
- [ ] Implémenter compression géométrique Meshopt/Draco lorsque pertinente.
- [ ] Implémenter textures KTX2/Basis et mipmaps adaptées au GPU.
- [ ] Définir budgets de triangles, bones, pixels de texture et draw calls par profil.
- [ ] Générer LOD visuels et vérifier leurs transitions.
- [ ] Définir bundling/streaming : minimum nécessaire au combat puis chargement anticipé.
- [ ] Préparer validation automatique des GLB (structure, textures, animations, matériaux, tailles).
- [ ] Créer prévisualiseur interne de personnages, animations et arènes.
- [ ] Créer comparaison automatique des tailles de bundles et temps de chargement.
- [ ] Nettoyer explicitement les ressources GPU lors de changement d'écran.

## 21. Performances et compatibilité navigateur

- [ ] Définir machines de référence desktop haut/moyen niveau et profil de repli.
- [ ] Atteindre une cadence de simulation stable de 60 ticks/s sous charge normale.
- [ ] Mesurer FPS au 1er percentile, frame time GPU/CPU, input delay et mémoire.
- [ ] Définir un objectif d'affichage de 60 FPS en 1080p sur le profil de référence.
- [ ] Établir budgets explicites de texture, animation, géométrie, post-process et audio.
- [ ] Comparer sur le même appareil la qualité photographique et les mesures 1% low FPS, frame time, VRAM et temps de chargement.
- [ ] Préserver un profil Ultra visuellement ambitieux tout en rendant Auto/High/Medium/Low adaptatifs et honnêtes sur leurs compromis.
- [ ] Vérifier chargements à connexion ralentie et éviter gros téléchargements initiaux.
- [ ] Optimiser skinning, draw calls, instancing, culling et shaders.
- [ ] Gérer device pixel ratio et résolution interne adaptative.
- [ ] Tester Chrome, Edge, Firefox, Safari selon les capacités réelles.
- [ ] Tester les manettes et le son sur Windows, macOS et Linux lorsque disponibles.
- [ ] Traiter WebGL context lost/restored et contextes sans accélération GPU.
- [ ] Vérifier que mode Low reste visuellement cohérent et surtout jouable.
- [ ] Évaluer WebGPU séparément derrière un contrat de rendu, sans compromettre la compatibilité WebGL2.

## 22. Tests, QA et automatisation

- [x] Ajouter des tests pour 71 coups, chords, directionnels, supers, sauts/attaques aériennes, combos cancel et mapping de rôles. (60 tests exécutés sous Node, 0 échec ; Vite/WebGL toujours à valider.)

**Banc IA contre IA :** voir [docs/ai-combat-qa.md](ai-combat-qa.md). Les statistiques automatiques ne remplacent pas le contrôle du rendu et des sensations.

- [ ] Mettre en place unit tests sur règles de combats, commandes, jauges, collisions et temporalité.
- [ ] Créer des fixtures déterministes de coups, combats complets et états attendus.
- [x] Ajouter un **test automatisé IA contre IA** : graines reproductibles, KO, touches, gardes, spéciaux, cadence et avertissements de stagnation ; rapport CLI sans GPU.
- [ ] Exécuter des combats **IA contre IA réellement rendus** dans le navigateur avec deux GLB photoréalistes autorisés, Mixamo retargeté, HUD, caméra, impacts et sons ; produire vidéos et captures WebSuite.
- [ ] Faire évaluer par Léon des duels IA contre IA observés à vitesse réelle, en Ultra et en mode optimisé : rythme, lisibilité, intérêt, photoréalisme et fluidité. Ne pas cocher sur métriques automatiques.
- [ ] Tester les mêmes inputs avec framerate rendu différent et vérifier même état final.
- [ ] Tester tous les états et transitions de la machine d'état du combattant.
- [ ] Tester collisions simultanées, coin, saut croisé, projections, trades, KO et fin au temps.
- [ ] Tester tous les patterns de coups spéciaux et priorités de commandes.
- [ ] Ajouter tests de régression de frame data par personnage.
- [ ] Ajouter tests E2E Playwright : démarrage, menu, sélection, combat, victoire, revanche, réglages.
- [ ] Ajouter des tests de rendu visuel des poses et arènes sur configuration stable.
- [ ] Réutiliser WebSuite générique de WarConquer, après adaptation à Vite/localhost et au véritable canvas WebGL de Fighters.
- [ ] Attendre le chargement des GLB/textures et un signal de frame réellement présentée avant toute capture WebSuite.
- [ ] Ajouter scénarios WebSuite reproductibles : portrait des combattants, poses extrêmes, impact, HUD, arène nocturne et lumière du jour.
- [ ] Distinguer les snapshots automatisés en Chrome logiciel et les mesures de qualité/performance sur un vrai GPU.
- [x] Garder les captures CI à la demande ou ciblées pour préserver les minutes GitHub Actions ; ne pas recopier les règles PR/Perception Lab de WarConquer.
- [ ] Ajouter tests de licence/manifeste et refus des assets sans provenance.
- [ ] Ajouter tests de budget bundle et temps de chargement.
- [ ] Ajouter tests de son (déclenchement attendu), tolérant aux limites AudioContext navigateur.
- [ ] Ajouter tests de compatibilité manette/clavier et accessibilité du menu.
- [ ] Ajouter replays de référence pour les régressions de gameplay.
- [ ] Prévoir tests rollback/synchronisation sous conditions réseau dégradées.
- [ ] Optimiser GitHub Actions : cache, path filtering, annulation des jobs obsolètes, pas de build lourd inutile.
- [ ] Documenter une checklist manuelle de validation visuelle lorsque l'automatisation ne peut conclure.
- [ ] Bloquer la publication du build si les vérifications de production essentielles échouent.

## 23. Déploiement, sécurité et exploitation

- [ ] Choisir hébergement HTTPS statique/CDN et méthode de déploiement production.
- [ ] Définir séparation entre code source public, assets redistribuables et ressources à accès restreint.
- [ ] Configurer cache de fichiers versionnés, compression HTTP et stratégies de purge.
- [ ] Prévoir service worker uniquement si sa gestion de versions est fiable.
- [ ] Définir politique CSP, validation des inputs externes et absence de secrets côté client.
- [ ] Prévoir observabilité des crashs WebGL, erreurs JavaScript et performances dans le respect de la vie privée.
- [ ] Ajouter écran d'erreur, récupération et diagnostics pour périphériques non pris en charge.
- [ ] Prévoir versions de données et migration de sauvegardes locales.
- [ ] Documenter rollback de déploiement **sans** réécriture destructive de l'historique Git.
- [ ] Publier crédits des artistes, licences et politique de données.
- [ ] Tester le build final servi publiquement, pas seulement le serveur de développement.
- [ ] Maintenir changelog, numéro de version et notes de corrections.

## 24. Ordre de construction (dépendances, pas « MVP »)

Le développement de chaque sous-système suit des dépendances techniques ; **toutes les exigences restent dans le périmètre du produit**.

- [ ] **Fondations** : structure, moteur déterministe, simulation 60 Hz, contrats de données, tests de base et pipeline 3D.
- [ ] **Combattants** : première famille de rigs réalistes conformes à la licence, pipeline de retargeting Mixamo, animation en jeu et volumes de collision.
- [ ] **Combat complet** : six boutons, déplacements, garde, combos, projections, spéciaux, jauges, rounds et équilibre initial.
- [ ] **Présentation haute fidélité** : PBR, peau/yeux/cheveux, arènes, lumière, caméra, HUD, sons, impacts et FX.
- [ ] **Expérience produit** : menus, sélection, modes, IA, entraînement, réglages, accessibilité et progression.
- [ ] **Fonctions compétitives** : replays, données de frames, options de tournoi et multijoueur avec rollback.
- [ ] **Exploitation** : optimisation, compatibilité, sécurité, tests E2E, publication, monitoring et corrections.
- [ ] Vérifier les critères d'acceptation de **chaque section** avant de l'annoncer achevée.
- [ ] Continuer le recrutement d'assets réalistes vérifiés et l'extension du roster tout au long du développement.

## 25. Critères de validation du produit

- [ ] Un combat complet oppose deux personnages **3D photoréalistes**, animés, avec des commandes classiques et une caméra latérale.
- [ ] Des combats IA contre IA complets et **visuellement observés** confirment que les échanges sont variés, lisibles et plaisants, et non seulement mathématiquement corrects.
- [ ] Tous les coups et collisions dépendent du moteur à 60 ticks/s, pas du timing du renderer.
- [ ] Les coups spéciaux, combos, parades, projections, rounds et HUD sont pleinement jouables et testés.
- [ ] Les impacts donnent une réponse cohérente en moins de quelques frames : animation, hitstop, effet, son, HUD.
- [ ] Les personnages n'ont pas de déformations majeures ni de glissements de pieds visibles en conditions normales.
- [ ] Les arènes et personnages ont un rendu cohérent et crédible en lumière/matière.
- [ ] L'objectif de 60 FPS est mesuré sur les configurations officiellement prises en charge.
- [ ] Deux joueurs peuvent jouer localement, et les modes annoncés sont fonctionnels.
- [ ] Les fonctions en ligne, lorsqu'exposées, ont des tests de désynchronisation, latence et abandon.
- [ ] Toutes les ressources distribuées disposent d'un statut de droits validé et d'attributions complètes.
- [ ] Les tests automatiques et les scénarios manuels pertinents passent sur le build de production.
- [ ] Le jeu publié se lance et termine un combat sur les navigateurs officiellement pris en charge.

---

### Références techniques et de licence

- [Adobe — FAQ Mixamo](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html)
- [Three.js — WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer)
- [Three.js — WebGPURenderer](https://threejs.org/manual/pages/webgpurenderer)
- [Poly Haven — licence CC0](https://polyhaven.com/license)
- [MakeHuman Community — licence des assets](https://www.makehumancommunity.org/about/license.html)
- [Sketchfab — conditions des téléchargements](https://sketchfab.com/developers/download-api/guidelines)
- [Freesound — FAQ et licences](https://freesound.org/help/faq/)

**Mise à jour :** 29 octobre 2026. Les conditions des fournisseurs doivent être revérifiées lors du téléchargement et de l'intégration effective.
