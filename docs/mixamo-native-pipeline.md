# Fighters — Mixamo natif, sans retargeting maison

## Objectif

**Décision ferme :** le workflow historique `.github/workflows/prepare-mixamo-gameplay.yml` qui réassemblait des animations YBot et les poussait sur `main` est maintenant **désactivé**. Aucun nouveau contenu de production ne peut être créé avec ce workflow. Le pipeline natif doit prendre des animations réellement obtenues sur le FBX du personnage dans une session Adobe, et non des copies des animations YBot. Les anciens GLB de la démo restent visibles uniquement à titre de compatibilité temporaire, sans approbation esthétique.

Adobe Mixamo doit animer DIRECTEMENT le personnage FBX riggé. Blender regroupe ensuite sept animations propres à ce même personnage sur un seul squelette. Aucune correction angulaire des bras, aucun transfert depuis YBot. Cette étape logiciel est en préparation et testée sur des données synthétiques, mais le service Adobe n'a pas encore validé Claudia.

## A. Export originaux terminé

[Action GitHub vérifiée](https://github.com/leye0/Fighters/actions/runs/41151779894) et [archive des trois FBX originaux](https://github.com/leye0/Fighters/actions/runs/41151779894/artifacts/13023780748).

Claudia et Carla : 89 os et 1 mesh skinné; Realistic Man : 34 os et 3 meshes skinnés. Les poids, matériaux et textures survivent au réimport FBX local.

## B. Animation dans Mixamo, une seule fois par personnage

1. Ouvrir https://www.mixamo.com/ avec une session Adobe et téléverser claudia.fbx par Upload Character.
2. Visualiser une marche de face, de profil et de dos. Arrêter si épaules, coudes, poignets ou poids de skinning sont incorrects. Aucun test numérique ne remplace cette étape.
3. Télécharger pour CLAUDIA (et non YBot) les sept mouvements voulus en FBX With Skin, de préférence In Place et 30 FPS lorsque l'option existe. Tous doivent provenir de la même importation de personnage.
4. Renommer les sept fichiers de manière exacte, en vérifiant que le contenu correspond réellement au mouvement :
   - Fighting_Idle.fbx
   - Walking_21.fbx
   - Walking_6.fbx
   - Walking_Backwards.fbx
   - Left_Turn_3.fbx
   - Jump.fbx
   - Falling_Idle.fbx

L'accès Adobe requiert une session connectée : GitHub Actions ne fournit pas une connexion Mixamo. Ne pas téléverser de FBX téléchargés de Mixamo dans le dépôt public sans validation de la licence.

## C. Intégration en une commande

Dans le dépôt Fighters, avec Blender et Python, placer les sept FBX dans un seul dossier privé puis exécuter :

    bash scripts/build-native-mixamo.sh /private/fighters/claudia-fbx /private/fighters/claudia-native.glb

Cette commande ne publie rien et refuse d'écraser un fichier. Elle vérifie :
- les sept fichiers et le même rig avec mêmes noms d'os, parents et poses de repos;
- au moins 15 articulations réellement animées par clip;
- la suppression des translations/scales de l'animation : la physique autoritaire conserve le déplacement;
- sept noms de clips compatibles avec le moteur Fighters, sept pistes réelles et pas d'animations parasites Blender;
- l'intégrité binaire GLB et le marqueur de provenance same-rig-mixamo-fbx-v1.

Les scripts principaux sont scripts/assemble-native-mixamo.py, scripts/check-native-mixamo-glb.py et scripts/inspect-runtime-glb.py.

## D. Visualisation locale avant publication

La page https://www.streamlev.com/Fighters/site/native-mixamo-review.html ouvre un GLB de l'appareil directement en mémoire. Le fichier n'est pas envoyé à un serveur. Le visualiseur offre les clips, les cinq angles, la lecture/pause, un curseur d'image et le squelette superposé.

Regarder précisément bras, épaules, coudes, poignets, appuis, saut et demi-tour sur plusieurs moments. Ne remplacer les GLB actuels de Fighters qu'après cette inspection et un contrôle du jeu WebGL avec les nouveaux modèles.

## E. Tests techniques, sans surpromesse

Le workflow de préparation exporte à nouveau les trois FBX originaux, réimporte ceux-ci à froid et crée des fixtures temporaires de sept mouvements SYNTHÉTIQUES pour tester toute la mécanique sans session Adobe. Les fixtures sont utilisées sur Claudia et le modèle masculin pour couvrir deux types de rigs. Les tests négatifs doivent rejeter un fichier manquant et un autre squelette.

Ces animations synthétiques ne prouvent PAS le fonctionnement de Mixamo sur Claudia, ne sont pas des clips Mixamo et ne sont pas intégrées au jeu publié. Elles ne doivent jamais être partagées comme des animations de production. Le verdict visuel du service Adobe est encore indispensable.

## F. Automatisation directe Adobe Mixamo (sans clic sur 21 animations)

Le contrôleur [`scripts/mixamo-direct-batch.py`](../scripts/mixamo-direct-batch.py) suit le parcours **officiel Web Mixamo** avec Chromium/Playwright : il téléverse le FBX original déjà skinné, attend le mapping automatique, recherche les **sept mouvements identifiés par notre catalogue** (titres, descriptions et UUID Adobe), télécharge chaque FBX `With Skin` à 30 FPS, vérifie sa signature binaire et son empreinte, puis laisse les fichiers dans un dossier privé par personnage. La distinction entre `Walking_21.fbx` (« Standard Walk ») et `Walking_6.fbx` (« Feminine Walk Forward ») est **obligatoire** : si le DOM d'Adobe ne permet pas de les identifier de façon unique, le script **échoue** plutôt que choisir une marche arbitraire.

Il refuse les mises en correspondance de rig impossibles, les marqueurs anatomiques demandés par Adobe, les clips ambigus et la réutilisation de fichiers sans provenance valide. Il ne contient **aucun code de retargeting YBot**, ni correction manuelle des épaules. Aucune session Adobe n'a encore été mise à disposition de ce chat : **aucun FBX natif réel n'a été téléchargé dans cette étape**.

Les 5 tests de logique hors connexion ont réussi dans [GitHub Actions 41159852518](https://github.com/leye0/Fighters/actions/runs/41159852518). Ces tests **ne prouvent pas** que Mixamo accepte le FBX.

### Usage local, session conservée hors de Git

```bash
python3 -m pip install playwright==1.56.0
python3 -m playwright install chromium

# La fenêtre Chromium demande la connexion Adobe seulement si nécessaire.
python3 scripts/mixamo-direct-batch.py --login-only

# Chaque personnage nécessite son FBX original issu du workflow d'export.
python3 scripts/mixamo-direct-batch.py --character claudia \
  --input-dir /dossier-prive/mes-fbx-originaux \
  --output-dir /dossier-prive/exports-adobe

bash scripts/build-native-mixamo.sh \
  /dossier-prive/exports-adobe/claudia \
  /dossier-prive/claudia-native.glb
```

### Exécution GitHub Actions avec session autorisée (un seul login Adobe initial)

Un workflow manuel [`mixamo-direct-adobe.yml`](../.github/workflows/mixamo-direct-adobe.yml) gère **un personnage par exécution**. Il reconstruit le FBX original propre, lance les téléchargements via Adobe puis appelle `build-native-mixamo.sh`. Il ne produit **qu'un artifact GLB intégré non publié**, destiné à la revue visuelle; aucun FBX brut Mixamo n'est committé.

Pour autoriser le navigateur hébergé, une session Adobe interactive doit avoir été ouverte une première fois. Le contrôleur peut exporter son état de façon privée, puis cet état peut être installé comme **secret** GitHub Actions :

```bash
python3 scripts/mixamo-direct-batch.py --login-only \
  --save-ci-state ~/.config/fighters/mixamo-state.b64

# GitHub CLI déjà authentifié : transmet le secret via stdin, pas via Git.
gh secret set MIXAMO_STORAGE_STATE_B64 -R leye0/Fighters \
  < ~/.config/fighters/mixamo-state.b64

gh workflow run mixamo-direct-adobe.yml -R leye0/Fighters \
  -f character=claudia
```

**Sécurité :** le fichier `.b64` représente des cookies de connexion et **n'est pas chiffré**. Ne jamais le committer, partager, coller dans un chat ni ajouter comme artifact. Le script exige une destination hors du dépôt et des droits 0600. Le retirer lorsqu'il n'est plus nécessaire; la session peut expirer ou être révoquée par Adobe. Ne jamais utiliser les identifiants Adobe en dur dans une Action.

**Statut actuel :** infrastructure automatique et tests hors ligne prêts. **Authentification Adobe du navigateur non vérifiée**, import des trois personnages non exécuté sur Adobe, aucune image de marche native approuvée. Dès que le serveur retourne les FBX natifs, la suite Blender se déroule sans étape manuelle de conversion, mais la revue visuelle 3D reste obligatoire avant de publier les GLB dans Fighters.

### Test réel de présence de session Adobe

L'Action [41160023307](https://github.com/leye0/Fighters/actions/runs/41160023307) a été déclenchée une seule fois sur le dépôt. Verdict vérifié : **aucun secret `MIXAMO_STORAGE_STATE_B64` configuré**, donc arrêt immédiat à `Check for previously authorized Adobe session` ; Blender, Playwright et Mixamo n'ont **pas** été exécutés pendant ce run. Le déclencheur `push` de test a ensuite été retiré afin d'éviter des minutes CI inutiles; le workflow direct Adobe est dorénavant **uniquement manuel**.

La dépendance précise n'est pas de choisir ou de télécharger 21 fichiers manuellement : c'est **une seule authentification Adobe initiale**, ou la mise à disposition d'une session déjà autorisée. Une fois la session fournie au navigateur, l'automatisation peut prendre le relais, sous réserve des contrôles de validité et d'éventuels défis interactifs Adobe. Les 5 tests hors ligne [41159852518](https://github.com/leye0/Fighters/actions/runs/41159852518) n'utilisent pas de connexion Adobe et ne démontrent pas sa compatibilité avec les modèles.

## Vérification HTTP réelle — catalogue libre, export protégé

Contrôles GitHub Actions du 30 octobre 2026 : [sept mouvements validés](https://github.com/leye0/Fighters/actions/runs/41161871429) et [test ciblé des routes d'écriture](https://github.com/leye0/Fighters/actions/runs/41162017168). Les appels GET au catalogue et aux sept fiches individuelles répondent HTTP 200 anonymement. Les sept UUID correspondent exactement au catalogue Fighters et les fiches incluent les paramètres d'animation. Les requêtes POST **vides**, sans jeton ni modèles, ont reçu **HTTP 401** aussi bien pour l'import d'un personnage que pour l'export d'une animation. Aucun FBX Adobe nouveau n'a été produit.

Le contrôleur Playwright résout dorénavant la **description actuelle** de chaque mouvement par son UUID exact avant de chercher sa carte dans le navigateur. La variation des noms affichés ne peut plus faire choisir une autre marche. [Sept tests hors ligne ont réussi](https://github.com/leye0/Fighters/actions/runs/41162110846), y compris les cas de descriptions modifiées et d'UUID incompatibles. Ces tests ne prouvent pas l'acceptation Adobe des modèles.

**Prochaine étape réelle :** fournir une session Adobe autorisée au workflow privé, sans exposer de jeton dans Git ni dans un chat. La génération directe de sept FBX sur chacun des trois squelettes, l'assemblage Blender et la vérification visuelle demeurent en attente; il n'existe pas de voie d'export anonyme démontrée.
