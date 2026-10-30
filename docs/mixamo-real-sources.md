# Fighters — sources réelles d'animations Mixamo sans fenêtre Adobe

## Découverte vérifiée

Le projet **WarConquer** documente une source alternative utile : [bibliothèque Mixamo WarConquer](https://github.com/leye0/WarConquer/blob/main/docs/mixamo-motion-library.md), construite à partir du miroir public [Linzhan/Mixamo-Animations-Characters](https://huggingface.co/datasets/Linzhan/Mixamo-Animations-Characters) sur Hugging Face.

- Ensemble de recherche documenté : **2 317 mouvements** sur squelette **YBot, 65 joints, 30 FPS**. Ce n'est ni une garantie de qualité visuelle ni une licence libre.
- Index d'origine utilisés : [animation_motion_prompts.json](https://huggingface.co/datasets/Linzhan/Mixamo-Animations-Characters/blob/main/animation_motion_prompts.json) et [animation_motion_frames.json](https://huggingface.co/datasets/Linzhan/Mixamo-Animations-Characters/blob/main/animation_motion_frames.json).
- **471 candidats de mouvements réels (triés par nom ET description, non encore visionnés)**, noms et identifiants connus, ont été retenus pour Fighters dans [le catalogue vérifiable](../assets/mixamo-available-clips.json) : garde, déplacements, poings, enchaînements, coups de pied, spéciaux, défenses et réactions.
- **299 FBX binaires ont été réellement téléchargés à titre de vérification technique**, dans un dossier privé temporaire hors dépôt, inspectés comme FBX et hachés en SHA-256 : `Fighting_Idle.fbx`, `Boxing_3.fbx`, `Boxing_7.fbx`, `Jab_Cross.fbx`, `Kicking_6.fbx`, `Mma_Kick_5.fbx`, `Punch_Combo.fbx`. Les **299 empreintes** sont dans le catalogue.
- **299 GLB animés réellement convertis en privé** (299/299, 0 erreur, environ 736 Mo), avec nombre de canaux et empreintes dans l'inventaire ; **0 clip dans le produit jouable**. Acquisition, conversion, retargeting, validation visuelle et licence sont des étapes différentes.
- **Complément du 30 octobre 2026 : trois pas arrière de boxe** (`Step_Backward`, `_2`, `_3`) supplémentaires récupérés (3/3 FBX vérifiés) et convertis en **3/3 GLB privés** avec canaux et SHA-256. Le total courant est donc **302/471 acquis et convertis** (743 514 348 octets GLB, zéro échec) ; **169 autres sources indexées** à acquérir.

Ce miroir ne demande pas d'ouvrir Mixamo dans un navigateur. On peut donc récupérer les clips via script, sans page de connexion éphémère. Il n'est pas un site officiel Adobe ni une nouvelle licence indépendante.

## Télécharger les animations brutes pour étude, sans les publier

```bash
# Résumer le catalogue complet (aucun téléchargement).
python3 scripts/acquire-mixamo.py --summary

# Afficher uniquement les coups de pied connus (aucun téléchargement).
python3 scripts/acquire-mixamo.py --list --family kick

# Télécharger toute la sélection dans un dossier PRIVÉ hors du repo, en parallèle.
python3 scripts/acquire-mixamo.py --destination /tmp/fighters-research-fbx --workers 1 --request-interval 5

# Ou télécharger un ensemble de mouvements réels dans un dossier PRIVÉ hors du repo.
python3 scripts/acquire-mixamo.py --destination /tmp/fighters-research-fbx --family punch --limit 12

# Cibler une animation déjà vérifiée.
python3 scripts/acquire-mixamo.py --destination /tmp/fighters-research-fbx --name Jab_Cross.fbx
```

**Limitation réellement observée lors de la première tentative :** le miroir a répondu HTTP 200 au test isolé, puis HTTP **429 Too Many Requests** pendant le lot. Après avoir acquis 41 nouveaux fichiers, le lot a été arrêté. Le script lit désormais `Retry-After` quand disponible, cadence les demandes entre tous les workers et interrompt la session dès le premier 429 pour respecter le serveur. Une reprise après refroidissement réutilise automatiquement les fichiers existants. **Nouvelle vérification : après refroidissement, le serveur renvoie de nouveau HTTP 200 à une cadence d'une requête toutes les 5 secondes ; 299 clips candidats sont téléchargés et convertis au checkpoint.**

Le script :
1. n'accepte que des noms précis recensés dans le catalogue ;
2. refuse une destination située **dans le dépôt Git public** ;
3. exige un fichier FBX binaire valide, contrôle taille et empreinte si connue ;
4. affiche un manifeste des fichiers privés récupérés ;
5. ne change pas `assets/animation-inventory.json` : aucun coup ne devient jouable par simple téléchargement.

Exemples de gestes présents dans l'index : `Boxing_3.fbx` (cross), `Boxing_7.fbx` (uppercut), `Jab_Cross.fbx` (enchaînement court), `Punch_Combo.fbx`, `Mma_Kick_5.fbx` (low kick), `Kicking_6.fbx` (roundhouse), `Fighting_Idle.fbx`. Le **geste réellement vu** décide du coup, de la portée et de la commande assignée ; le titre ne suffit pas.

## Conversion réelle FBX vers GLB animé

Le même convertisseur que WarConquer (binaire `FBX2glTF` du paquet `fbx2gltf@0.9.7-p1`) a été testé avec succès sur le vrai `Jab_Cross.fbx` : GLB valide de 2,4 Mo avec **1 animation, 67 canaux, 69 nœuds et 2 skins**. Ce fichier a été généré hors du dépôt public. **L'acquisition privée de 299 sources correspondantes a ensuite été convertie en lot : 299 GLB valides, 0 erreur et 736 332 768 octets au total.** Toutes les sorties contiennent au moins une animation et un canal actif ; aucune n'est encore approuvée pour des coups dans le jeu.

```bash
# Installer le convertisseur dans un environnement local (ne pas stocker ses sorties dans Git).
npm install --no-save --package-lock=false fbx2gltf@0.9.7-p1

# Inspecter les sources déjà disponibles, sans conversion.
python3 scripts/convert-mixamo-fbx.py --input /tmp/fighters-research-fbx --output /tmp/fighters-research-glb --summary

# Convertir toutes les sources effectivement présentes, en privé, avec quatre processus.
python3 scripts/convert-mixamo-fbx.py --input /tmp/fighters-research-fbx --output /tmp/fighters-research-glb --workers 4

# Convertir un clip particulier (exemple testable).
python3 scripts/convert-mixamo-fbx.py --input /tmp/fighters-research-fbx --output /tmp/fighters-research-glb --name Jab_Cross.fbx
```

Le script contrôle la signature FBX et ses SHA connus, génère le GLB avec les animations à 30 FPS, vérifie **l'existence de véritables canaux d'animation**, et laisse un rapport dans le dossier privé. Il accepte de reprendre les GLB déjà convertis ; l'absence de fichiers non encore téléchargés est comptabilisée sans fabriquer de clips.

Ces GLB sont des **animations de recherche**, ni des coups approuvés ni des fichiers librement redistribuables. Il reste à appliquer leurs os aux rigs photoréalistes, examiner les gestes, les transitions et les collisions.

## Limites de droit et de qualité

L'étiquette du dataset est **`adobe-mixamo-terms`**, **pas CC0**. La [FAQ Adobe officielle](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html) autorise l'utilisation de Mixamo dans des jeux vidéo, mais cela ne signifie pas que nous pouvons **republier librement les FBX sources sur GitHub**. Le caractère actuellement non commercial de Fighters ne change pas la question de redistribution. Ne committer ni fichiers bruts ni GLB isolés dérivés tant que le mode de distribution n'est pas juridiquement vérifié ; le jeu final devra respecter les conditions applicables. Les résultats d'un miroir tiers sont à revalider au besoin auprès d'Adobe.

Pour passer des mouvements réels à un jeu photoréaliste :
- [x] Retrouver une source de mouvements réelle utilisée par WarConquer.
- [x] Établir l'inventaire de 471 animations nommées et identifiées.
- [x] Vérifier 299 téléchargements privés de FBX binaires avec SHA-256.
- [x] Ajouter un outil d'acquisition reproductible, sans dépendance ni action GitHub.
- [ ] Confirmer les droits exacts du mode de distribution final et l'authenticité des fichiers sources retenus.
- [x] Convertir en privé les 299 FBX acquis en GLB contenant de vrais canaux d'animation (299/299 valides).
- [ ] Récupérer les 169 FBX sources restant dans la sélection et les convertir. La reprise séquentielle du CDN fonctionne après refroidissement ; les fichiers restants continuent d'être acquis progressivement avec une cadence prudente.
- [ ] Sélectionner des combattants photoréalistes, notamment des femmes, avec rigs appropriés.
- [ ] Retargeter, inspecter de profil et corriger les glissements et déformations sur ces corps réels.
- [ ] Mesurer les frames de contact et choisir les commandes de combat sur la base des gestes rendus.
- [ ] Faire approuver les clips dans `assets/animation-inventory.json`, puis les raccorder au moteur.
- [ ] Faire combattre deux IA dans le vrai rendu WebGL, tester l'impact des coups et obtenir l'avis de Léon avec enregistrement WebSuite.

## Autres pistes

- [Mixamo officiel](https://www.mixamo.com/) : source Adobe de référence quand une session persistante est accessible.
- [Universal Animation Library de Quaternius](https://quaternius.com/packs/universalanimationlibrary2.html) : autre bibliothèque d'animations, sous licence CC0 selon l'auteur ; qualité à comparer avant emploi dans des personnages photoréalistes.
- [Script et méthode WarConquer](https://github.com/leye0/WarConquer/blob/main/scripts/convert-mixamo-fbx.py) : référence technique de conversion FBX; ne copier aucune sortie tierce sans vérifier les droits.

**Important :** les 471 noms sont des **candidats triés selon leurs descriptions réelles** à partir des 2 317 entrées, pas 471 animations déjà approuvées. La sélection précédente de 705 noms était trop large : 234 candidats mal adaptés (fusils, accessoires, mouvements hors arène, etc.) ont été retirés. Certains clips seront retirés après visionnement de leur gestuelle. L'index vérifie des métadonnées et le FBX binaire vérifie son format; aucune de ces deux vérifications ne démontre encore qu'un clip est beau, exempt d'artefacts, ou utilisable sur un combattant. Le critère final est une lecture visuelle de l'animation retargetée dans Fighters.
