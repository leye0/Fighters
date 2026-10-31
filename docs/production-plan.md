# Fighters — plan de production

**Référence courante : 31 octobre 2026.** Jeu visé : beat’em up 3D solo à scrolling latéral, animation-first, multiple ennemis, caméra centrée sur la joueuse sauf aux limites du niveau. Pas de physique solide entre personnages ; seuls les coups utilisent des volumes de collision explicites.

## Guide de reprise pour agent externe

1. Travailler **sur `main`**, sans branche ni PR, en respectant `AGENTS.md`.
2. Entrée jouable actuelle : `beat-em-up.html` et `src/beat-em-up.ts`. `index.html` est une redirection vers celle-ci.
3. **Casting actuel :** Claudia (`?hero=claudia`), Carla (`?hero=carla`) ; adversaires Realistic Man. Ce sont des modèles Sketchfab CC BY avec attributions dans `assets/source/characters/`.
4. **Animations actuelles :** Quaternius Universal Animation Library 1 + 2, 86 clips CC0 par modèle sur ses propres joints, `UAL1_*` / `UAL2_*`, générés par `scripts/build-quaternius-animations.mjs`, contrôlés par `scripts/check-quaternius-models.mjs`. Le workflow `quaternius-animations.yml` télécharge les deux archives à SHA fixes, produit les trois GLB et les pousse sur main avec le site. Aucun pipeline d’animation antérieur n’est autorisé.
5. Tests : `npm test`, `npm run typecheck`, `npm run build`, `npm run animation:verify` **après génération**. QA WebGL via `tests/browser/beat-em-up-control.json` et `beat-webgl-qa.yml`.
6. Les trois gestes de combat accessibles par F/G/H sont des **animations sans dégâts**. Ne pas déclarer les attaques de production validées : `assets/animation-inventory.json` n’en a aucune tant que contacts, timing et résultat visuel ne sont pas examinés. Ne jamais auto-approuver les clips.
7. Préserver le contrôle explicite gauche/droite de l’orientation, les trois axes X/Z/Y, la simulation à 60 Hz, l’absence de collision entre personnages, le rendu riggé réel et les crédits. Les modèles n’ont **pas** de certificat esthétique humain.
8. Ne pas déclencher des actions CI inutiles : les workflows ciblés construisent les animations et le site lorsque leur entrée change, avec une seule publication des modèles.

## Acquis vérifiables

- [x] Acquérir Claudia et Carla, modèles féminins riggés, et Realistic Man, modèle masculin riggé, avec leurs sources et attributions CC BY vérifiées dans les dossiers d’assets.
- [x] Construire un monde de navigation déterministe à 60 Hz (X, profondeur Z, hauteur Y), plateformes, gravité, saut et caméra qui défile.
- [x] Garder l’orientation sous le contrôle gauche/droite et permettre le passage des personnages les uns à travers les autres.
- [x] Charger et cloner les **vrais skins 3D** pour une héroïne et plusieurs adversaires, sans capsule de substitution.
- [x] Permettre le choix Claudia / Carla sur la page du jeu.
- [x] Construire un retargeting automatisé Quaternius Standard 1 + 2 pour chaque rig : **86 actions** distinctes, locomotion, saut, impacts et coups, et conversion vers les GLB complets.
- [x] Supprimer les pipelines d’acquisition, previews, données et workflows d’animation devenus obsolètes ; aligner Vite sur la scène actuelle.
- [x] Vérifier structurellement la licence/source par checksum, les clips, les joints du skin, les canaux de rotation, l’anatomie générale et 28 poses réelles par personnage.
- [x] Ajouter les commandes F/G/H de prévisualisation de vrais clips de jab, cross et hook, **sans dégâts fictifs**.
- [x] Préparer la génération et publication automatique des trois modèles et du site depuis `main` dans GitHub Actions.

## En attente de vérification ou de réalisation

- [ ] Vérifier l’exécution **réelle et réussie** du nouveau workflow CI : trois GLB régénérés sur `main`, `docs/site` rebâti, puis Pages servi.
- [ ] Capturer et analyser des rendus WebGL de Claudia, Carla et Realistic Man : bras, mains, bassin, sauts, pieds en appui, marche à gauche/droite, attaques et réceptions. Les tests de matrice et de bounding box ne remplacent pas un examen visuel.
- [ ] Vérifier sur mobile le cadrage aux quatre frontières, les contrôles tactiles, les sauts et les FPS réels sans sacrifier la qualité de rendu.
- [ ] Examiner et mesurer les **contacts effectifs** des coups (début, fenêtre active, reprise), par clip et par personnage, avant inscription dans l’inventaire d’attaques approuvées.
- [ ] Relier les coups approuvés aux commandes, hitboxes/hurtboxes X/Y/Z, dégâts, réactions, blocages et combinaisons déterministes à 60 Hz.
- [ ] Ajouter l’arsenal, les interactions de scène, le parcours complet, l’IA de combat en groupe, les réactions à coups et les effets audio/visuels.
- [ ] Remplacer les volumes de décors provisoires par des environnements 3D optimisés sans perdre les performances.
- [ ] Définir les identités définitives et le casting élargi avec le propriétaire ; ne pas inférer des attributs sociaux ou personnels des scans.
- [ ] Après disponibilité du gameplay combat réel, évaluer le plaisir de jeu et l’esthétique avec Léon sur de vraies séquences, sans inventer son approbation.

## Critères de clôture

Une case passe à [x] seulement avec preuve concrète. La disponibilité d’un clip et le bon fonctionnement d’un test structurel prouvent la présence d’animation, **pas** la qualité des contacts, du rendu ou du jeu. Les modèles Sketchfab CC BY sont attribués ; les deux bibliothèques d’animations sont CC0, et les versions sources sont identifiées par SHA-256. Détails dans `docs/quaternius-pipeline.md`.
