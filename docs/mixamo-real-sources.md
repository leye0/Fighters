# Fighters — sources réelles d'animations Mixamo sans fenêtre Adobe

## Découverte vérifiée

Le projet **WarConquer** documente une source alternative utile : [bibliothèque Mixamo WarConquer](https://github.com/leye0/WarConquer/blob/main/docs/mixamo-motion-library.md), construite à partir du miroir public [Linzhan/Mixamo-Animations-Characters](https://huggingface.co/datasets/Linzhan/Mixamo-Animations-Characters) sur Hugging Face.

- Ensemble de recherche documenté : **2 317 mouvements** sur squelette **YBot, 65 joints, 30 FPS**. Ce n'est ni une garantie de qualité visuelle ni une licence libre.
- Index d'origine utilisés : [animation_motion_prompts.json](https://huggingface.co/datasets/Linzhan/Mixamo-Animations-Characters/blob/main/animation_motion_prompts.json) et [animation_motion_frames.json](https://huggingface.co/datasets/Linzhan/Mixamo-Animations-Characters/blob/main/animation_motion_frames.json).
- **705 candidats de mouvements réels (non visionnés)**, noms et identifiants connus, ont été retenus pour Fighters dans [le catalogue vérifiable](../assets/mixamo-available-clips.json) : garde, déplacements, poings, enchaînements, coups de pied, spéciaux, défenses et réactions.
- **7 FBX binaires ont été réellement téléchargés à titre de vérification technique**, dans un dossier privé temporaire hors dépôt, inspectés comme FBX et hachés en SHA-256 : `Fighting_Idle.fbx`, `Boxing_3.fbx`, `Boxing_7.fbx`, `Jab_Cross.fbx`, `Kicking_6.fbx`, `Mma_Kick_5.fbx`, `Punch_Combo.fbx`. Les empreintes sont dans le catalogue.
- **0 clip dans le produit jouable** ; acquisition technique et exploitation artistique/légale sont des étapes différentes.

Ce miroir ne demande pas d'ouvrir Mixamo dans un navigateur. On peut donc récupérer les clips via script, sans page de connexion éphémère. Il n'est pas un site officiel Adobe ni une nouvelle licence indépendante.

## Télécharger les animations brutes pour étude, sans les publier

```bash
# Résumer le catalogue complet (aucun téléchargement).
python3 scripts/acquire-mixamo.py --summary

# Afficher uniquement les coups de pied connus (aucun téléchargement).
python3 scripts/acquire-mixamo.py --list --family kick

# Télécharger toute la sélection dans un dossier PRIVÉ hors du repo, en parallèle.
python3 scripts/acquire-mixamo.py --destination /tmp/fighters-research-fbx --workers 10

# Ou télécharger un ensemble de mouvements réels dans un dossier PRIVÉ hors du repo.
python3 scripts/acquire-mixamo.py --destination /tmp/fighters-research-fbx --family punch --limit 12

# Cibler une animation déjà vérifiée.
python3 scripts/acquire-mixamo.py --destination /tmp/fighters-research-fbx --name Jab_Cross.fbx
```

Le script :
1. n'accepte que des noms précis recensés dans le catalogue ;
2. refuse une destination située **dans le dépôt Git public** ;
3. exige un fichier FBX binaire valide, contrôle taille et empreinte si connue ;
4. affiche un manifeste des fichiers privés récupérés ;
5. ne change pas `assets/animation-inventory.json` : aucun coup ne devient jouable par simple téléchargement.

Exemples de gestes présents dans l'index : `Boxing_3.fbx` (cross), `Boxing_7.fbx` (uppercut), `Jab_Cross.fbx` (enchaînement court), `Punch_Combo.fbx`, `Mma_Kick_5.fbx` (low kick), `Kicking_6.fbx` (roundhouse), `Fighting_Idle.fbx`. Le **geste réellement vu** décide du coup, de la portée et de la commande assignée ; le titre ne suffit pas.

## Limites de droit et de qualité

L'étiquette du dataset est **`adobe-mixamo-terms`**, **pas CC0**. La [FAQ Adobe officielle](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html) autorise l'utilisation de Mixamo dans des jeux vidéo, mais cela ne signifie pas que nous pouvons **republier librement les FBX sources sur GitHub**. Le caractère actuellement non commercial de Fighters ne change pas la question de redistribution. Ne committer ni fichiers bruts ni GLB isolés dérivés tant que le mode de distribution n'est pas juridiquement vérifié ; le jeu final devra respecter les conditions applicables. Les résultats d'un miroir tiers sont à revalider au besoin auprès d'Adobe.

Pour passer des mouvements réels à un jeu photoréaliste :
- [x] Retrouver une source de mouvements réelle utilisée par WarConquer.
- [x] Établir l'inventaire de 705 animations nommées et identifiées.
- [x] Vérifier un téléchargement privé de 7 FBX binaires avec SHA-256.
- [x] Ajouter un outil d'acquisition reproductible, sans dépendance ni action GitHub.
- [ ] Confirmer les droits exacts du mode de distribution final et l'authenticité des fichiers sources retenus.
- [ ] Convertir les FBX retenus en animations glTF, avec conservation des courbes et vitesse réelle.
- [ ] Sélectionner des combattants photoréalistes, notamment des femmes, avec rigs appropriés.
- [ ] Retargeter, inspecter de profil et corriger les glissements et déformations sur ces corps réels.
- [ ] Mesurer les frames de contact et choisir les commandes de combat sur la base des gestes rendus.
- [ ] Faire approuver les clips dans `assets/animation-inventory.json`, puis les raccorder au moteur.
- [ ] Faire combattre deux IA dans le vrai rendu WebGL, tester l'impact des coups et obtenir l'avis de Léon avec enregistrement WebSuite.

## Autres pistes

- [Mixamo officiel](https://www.mixamo.com/) : source Adobe de référence quand une session persistante est accessible.
- [Universal Animation Library de Quaternius](https://quaternius.com/packs/universalanimationlibrary2.html) : autre bibliothèque d'animations, sous licence CC0 selon l'auteur ; qualité à comparer avant emploi dans des personnages photoréalistes.
- [Script et méthode WarConquer](https://github.com/leye0/WarConquer/blob/main/scripts/convert-mixamo-fbx.py) : référence technique de conversion FBX; ne copier aucune sortie tierce sans vérifier les droits.

**Important :** les 705 noms sont des **candidats sélectionnés sur métadonnées** à partir des 2 317 entrées, pas 705 animations déjà approuvées. Certains clips seront retirés après visionnement de leur gestuelle. L'index vérifie des métadonnées et le FBX binaire vérifie son format; aucune de ces deux vérifications ne démontre encore qu'un clip est beau, exempt d'artefacts, ou utilisable sur un combattant. Le critère final est une lecture visuelle de l'animation retargetée dans Fighters.
