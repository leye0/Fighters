# Fighters — plan de production

**Référence courante : 31 octobre 2026.** Jeu visé : beat’em up 3D solo à scrolling latéral, animation-first, multiple ennemis, caméra centrée sur la joueuse sauf aux limites du niveau. Pas de physique solide entre personnages ; seuls les coups utilisent des volumes de collision explicites.

## Guide de reprise pour agent externe

1. Travailler **sur `main`**, sans branche ni PR, en respectant `AGENTS.md`.
2. Entrée jouable actuelle : `beat-em-up.html` et `src/beat-em-up.ts`. `index.html` est une redirection vers celle-ci.
3. **Casting actuel :** Claudia (`?hero=claudia`), Carla (`?hero=carla`) ; adversaires Realistic Man. Ce sont des modèles Sketchfab CC BY avec attributions dans `assets/source/characters/`.
4. **Animations actuelles :** Quaternius Universal Animation Library 1 + 2 (86 clips CC0 par modèle) et deux kicks ACCAD / The Ohio State University **CC BY 3.0** (88 au total par rig), générés par `scripts/build-quaternius-animations.mjs`, contrôlés par `scripts/check-quaternius-models.mjs`. Le workflow `quaternius-animations.yml` télécharge les trois archives à SHA fixes, produit les trois GLB et les pousse sur main avec le site.
5. Tests : `npm test`, `npm run typecheck`, `npm run build`, `npm run animation:verify` **après génération**. QA WebGL de **Claudia, Carla, des dégâts et de l’IA hostile** via `tests/browser/beat-em-up-*.json` et `beat-webgl-qa.yml`.
6. Les gestes de combat F/G (poings) et H/I (pieds) déclenchent **de vrais dégâts et réactions de démo** calculés par `src/engine/beat-combat.ts` à 60 Hz. Les volumes, timings et dégâts sont des réglages **provisoires** : `assets/animation-inventory.json` ne comporte toujours aucune attaque de production approuvée tant que les contacts ne sont pas examinés par une personne.
7. Préserver le contrôle explicite gauche/droite de l’orientation, les trois axes X/Z/Y, la simulation à 60 Hz, l’absence de collision entre personnages, le rendu riggé réel et les crédits. Les modèles n’ont **pas** de certificat esthétique humain.
8. Ne pas déclencher des actions CI inutiles : les workflows ciblés construisent les animations et le site lorsque leur entrée change, avec une seule publication des modèles.

## Acquis vérifiables

- [x] Acquérir Claudia et Carla, modèles féminins riggés, et Realistic Man, modèle masculin riggé, avec leurs sources et attributions CC BY vérifiées dans les dossiers d’assets.
- [x] Construire un monde de navigation déterministe à 60 Hz (X, profondeur Z, hauteur Y), plateformes, gravité, saut et caméra qui défile.
- [x] Garder l’orientation sous le contrôle gauche/droite et permettre le passage des personnages les uns à travers les autres.
- [x] Charger et cloner les **vrais skins 3D** pour une héroïne et plusieurs adversaires, sans capsule de substitution.
- [x] Permettre le choix Claudia / Carla sur la page du jeu.
- [x] Construire un retargeting automatisé Quaternius Standard 1 + 2 pour chaque rig : **86 actions** distinctes, locomotion, saut, impacts et coups, et conversion vers les GLB complets.
- [x] Ajouter **deux vrais coups de pied ACCAD** (front et roundhouse, CC BY 3.0) dans la même chaîne de retargeting sans navigateur ni compte : 88 actions par rig. Génération locale réussie pour les trois personnages ; vérification de **36 poses 3D dans les bornes structurelles par personnage** réussie, fichiers de source figés par SHA. **Squelette source différent : compatibilité anatomique et qualité perceptuelle non garanties**, risque accepté explicitement par Léon pour la démo.
- [x] Supprimer les pipelines d’acquisition, previews, données et workflows d’animation devenus obsolètes ; aligner Vite sur la scène actuelle.
- [x] Vérifier structurellement la licence/source par checksum, les clips, les joints du skin, les canaux de rotation, l’anatomie générale et 28 poses réelles par personnage.
- [x] Brancher F/G/H sur trois vrais clips CC0 avec volumes de contact X/Z/Y, dégâts, étourdissement, réaction, animation de mort et KO déterministes. Fenêtres et équilibrage **provisoires**, non approuvés esthétiquement.
- [x] Ajouter une IA ennemie combattante, le HUD de vies, la victoire/défaite et le redémarrage ; ajouter des tests déterministes de contacts, échanges et KO. Aucun moteur de duel 1v1 ancien n'est conservé.
- [x] Remplacer le D-pad tactile par **glissement libre gauche avec relâchement**, offrir quatre grandes surfaces à droite **10 % fond / 20 % contour**, **deux poings en haut, deux pieds en bas, SAUT central** et glissement entre frappes. Unit tests du multitouch, maintien de mouvement, buffering d'attaques et saut central.
- [x] Supprimer toutes les sources, tests et commandes du banc 1v1 et des anciens contrôleurs d’animation, en conservant les outils d’import des trois personnages source et l’unique pipeline Quaternius.
- [x] Préparer la génération et publication automatique des trois modèles et du site depuis `main` dans GitHub Actions.

## En attente de vérification ou de réalisation

- [x] Génération automatique réussie sur `main` : workflow **41238756248**, trois GLB régénérés de manière idempotente et site rebâti. Publication Pages **41238807438** réussie, URLs JavaScript/CSS relatives vérifiées ; page et trois modèles accessibles en HTTP 200 avec MIME GLB.
- [x] QA navigateur WebGL logiciel réussie pour **Claudia et Carla** : [workflow 41238807306](https://github.com/leye0/Fighters/actions/runs/41238807306), 114 tests de règles, présence réelle des trois skins, dimensions projetées plausibles, déplacement, inversion de direction, saut et gestes CC0 de combat ; [captures PNG](https://github.com/leye0/Fighters/actions/runs/41238807306/artifacts/13056404677) conservées. Réussite technique, **pas** approbation esthétique ni preuve des FPS iPhone.
- [x] **QA navigateur de la démo jouable réussie** : [workflow 41265197295](https://github.com/leye0/Fighters/actions/runs/41265197295), `npm test`, `animation:verify`, `npm run build`, Claudia, Carla, captures figées sur les frames de frappe F/G/H, variation des PV, KO d'un ennemi et riposte hostile ; [captures WebGL](https://github.com/leye0/Fighters/actions/runs/41265197295/artifacts/13066749003). [Publication Pages 41264806585](https://github.com/leye0/Fighters/actions/runs/41264806585) réussie ; HTTP 200 constaté sur le site. Cela prouve le fonctionnement technique **mais pas l'approbation esthétique humaine ni les FPS mobiles**.
- [ ] **Publier et tester la nouvelle version mobile + kicks** : workflow build des 88 clips avec vérification des licences et 36 poses/rig, CI WebGL des deux héroïnes avec coups H/I, contrôle tactile sur navigateur simulant des doigts, déploiement Pages et HTTP 200. Ne cocher qu’après succès observé.
- [ ] Capturer et analyser des rendus WebGL de Claudia, Carla et Realistic Man : bras, mains, bassin, sauts, pieds en appui, marche à gauche/droite, attaques et réceptions. Les tests de matrice et de bounding box ne remplacent pas un examen visuel.
- [ ] Vérifier sur mobile le cadrage aux quatre frontières, les contrôles tactiles, les sauts et les FPS réels sans sacrifier la qualité de rendu.
- [ ] Examiner et mesurer les **contacts effectifs** des coups (début, fenêtre active, reprise), par clip et par personnage, avant inscription dans l’inventaire d’attaques approuvées.
- [ ] Après validation humaine des contacts, convertir les quatre coups provisoires en entrées de l’arsenal de production ; ajouter gardes, nouveaux coups, combos et essais de balance sur les trois morphologies.
- [ ] Ajouter les interactions de scène, le parcours complet, une IA de combat en groupe plus riche, les effets audio/visuels et les décors finalisés.
- [ ] Remplacer les volumes de décors provisoires par des environnements 3D optimisés sans perdre les performances.
- [ ] Définir les identités définitives et le casting élargi avec le propriétaire ; ne pas inférer des attributs sociaux ou personnels des scans.
- [ ] Après disponibilité du gameplay combat réel, évaluer le plaisir de jeu et l’esthétique avec Léon sur de vraies séquences, sans inventer son approbation.

## Critères de clôture

Une case passe à [x] seulement avec preuve concrète. La disponibilité d’un clip et le bon fonctionnement d’un test structurel prouvent la présence d’animation, **pas** la qualité des contacts, du rendu ou du jeu. Les modèles Sketchfab et les deux kicks ACCAD sont CC BY avec attributions ; les 86 animations Quaternius sont CC0 ; les trois archives sont identifiées par SHA-256. Détails dans `docs/quaternius-pipeline.md`.
