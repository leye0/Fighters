# Fighters — plan de développement du beat’em up 3D

> **Direction approuvée par Léon le 30 octobre 2026 :** un **side-scrolling beat’em up d’action en vraie 3D**, dans l’esprit structurel de *Double Dragon*. On traverse rues, bâtiments, bacs de poubelles et toits sur plusieurs niveaux de hauteur ; on affronte plusieurs ennemis ; on avance/recul tout en se tournant vers une menace proche. Ce projet **n’est pas** un duel d’arène 1v1.
>
> **Caméra :** en zone libre, le héros est **exactement au centre de l’image** : le monde défile sur les axes écran horizontal et vertical. Lorsqu’une limite de niveau est visible (gauche, droite, haut ou bas), la caméra s’arrête sur cette frontière et le héros peut se rapprocher du bord de l’écran. Même règle aux quatre coins, en format portrait et paysage.
> 
> **Méthode :** directement sur `main`, sans PR ; architecture de production dès le départ, sans faux gameplay, sans considérer les tests de simulation comme une validation esthétique. **L’aspect des plateformes et du parcours reste volontairement minimaliste pendant tout le développement des systèmes ; leur véritable design se fera après le reste du gameplay.** Le photoréalisme reste l’objectif final, avec performance mesurée. Les décisions, clip IDs et cases de qualité doivent rester documentés.
>
> **Archives :** [plan historique du duel/arène](production-plan-arena-archive.md) conservé à titre de trace, mais ses rounds, six boutons imposés et règles compétitives ne dirigent plus ce produit. Voir aussi [l’architecture beat’em up](beat-em-up-architecture.md) et [la politique animation-first](animation-first.md).

## Situation actuelle — preuves et limites

| Système | Acquis vérifié | Pas encore accompli |
| --- | --- | --- |
| Source animations | **63/63 retenues par Léon**, noms, motion IDs et empreintes FBX/GLB conservés dans [la sélection](../assets/mixamo-selected.json) | Retargeting sur héros définitifs, clips en jeu, frames de contact, combos validés |
| Acquisition | 471 candidats indexés parmi 2 317 entrées ; **302 FBX acquis et 302 GLB convertis en privé** dans les travaux précédents | Les fichiers binaires ne sont pas présents dans le dépôt public ni dans l’environnement actuel |
| Regroupement GLB | Scripts d’acquisition ciblée + construction d’un **pack à 63 clips**, tests binaires synthétiques et identités contrôlées | Exécuter le pipeline sur les 63 vrais GLB et inspecter le résultat en 3D |
| Navigation beat’em up | Noyau déterministe `beat-em-up-world.ts` avec surfaces X/Z/Y, saut/chute, petites marches, obstacles surélevés et sélection stable des menaces ; **8 tests** | Branchement aux inputs, scènes, collisions complètes et combats à plusieurs |
| Caméra | `beat-scroll-camera.ts` : centrage exact hors frontières, limites sur les quatre côtés, projection logique de profondeur/hauteur ; **9 tests** | Pilotage effectif d’une caméra Three.js réelle sur un niveau |
| Combat hérité | Simulation autoritative 1v1, coups/fenêtres, couches d’animation, IA déterministe ; **93 tests Node** avant ajout des nouveaux tests | Adapter la simulation à une troupe d’ennemis et à la profondeur, sans exposer les 71 coups synthétiques comme arsenal |
| Rendu | Three.js/Vite/WebGL, éclairage et chargement de GLB, lecteur de clips et superposition YBot expérimentale | Héros photoréaliste, environnement urbain final, performances sur machine réelle, animation riggée complète |
| Publication | [Lecteur mobile des 63 vidéos via GitHub Pages](https://www.streamlev.com/Fighters/site/animation-review.html), Action réussie | Le jeu beat’em up complet n’est pas encore publié/jouable |

**Convention d’état :** « source sélectionnée » ≠ « clip GLB testé » ≠ « clip retargeté pour un héros » ≠ « coup jouable et validé ». Chaque étape conserve des preuves séparées.

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

1. **Parcours gris/boîtes + caméra :** raccorder le nouveau noyau X/Z/Y et la caméra centrée/bornée à Three.js ; traversée continue du sol, d’un bloc/benne et d’une hauteur de bâtiment **sans travail de décor artistique**.
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
