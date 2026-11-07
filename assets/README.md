# Modèles et ressources du jeu

L'ajout de ressources n'exige **pas** de retélécharger et de convertir tous les
modèles à chaque déploiement. Deux catégories existent :

1. **Fichiers légers, directement utilisés** : ajouter le modèle ou le son sous
   `app/models/` ou `app/sounds/`, avec son attribution et le code qui le charge.
   GitHub Pages et la QA incluent déjà ces dossiers. Éviter d'utiliser un nom
   écrasé par le paquet généré.
2. **Fichiers volumineux ou à transformer** (compression, découpage,
   harmonisation de modèles, etc.) : conserver la source dans le dépôt si sa
   taille le permet, sinon enregistrer une URL stable et son empreinte SHA-256
   dans le script d'importation. Ajouter les étapes nécessaires dans
   `scripts/prepare-runtime-assets.sh`. Ne jamais dépendre d'une URL changeante
   sans vérification d'intégrité ou oublier les conditions de licence.

## Publier une nouvelle version par les workflows habituels (sans PR)

1. Pousser une modification d'une source de reconstruction sur `main`.
   `scripts/runtime-asset-changes.mjs` détermine précisément quels fichiers
   demandent une reconstruction ; les autres modifications réutilisent le ZIP
   existant. Le fichier `assets/runtime-rebuild.request` permet également de
   réclamer une reconstruction sans changer de source.
2. Le **workflow Chrome habituel** `browser-qa.yml` reconstruit le paquet avec
   les versions épinglées, puis exécute ses suites Node et Chrome habituelles
   (`visual`, `economy`, `combat`). Si un test échoue, rien n'est publié.
3. Le job de publication de cette même QA reprend **exactement les fichiers
   testés**, crée la prochaine GitHub Release (`v2`, puis `v3`...), et écrit
   son SHA-256 dans `assets/runtime-assets.lock`, sans PR ni force-push.
4. La QA habituelle et Pages sont ensuite relancées sur `main` pour restaurer
   et vérifier l'archive publiée. Le workflow Pages conserve sa responsabilité
   exclusive pour le déploiement du site.

Le même workflow Chrome permet un lancement manuel exceptionnel en cochant
`rebuild_assets` dans ses entrées ; il n'existe aucun deuxième workflow de
reconstruction. Une version déjà publiée ne peut pas être écrasée.

Les versions publiées sont conservées ; elles ne sont jamais écrasées. Pour
revenir à une version antérieure, restaurer sa valeur de `tag`, `archive` et
`sha256` dans le fichier `assets/runtime-assets.lock`.

## Pendant le développement ordinaire

- `scripts/use-pinned-runtime-assets.sh` restaure le paquet préconstruit dont
  l'empreinte correspond au verrou. Un ZIP déjà présent sous `.cache/fighters/`
  est réutilisé ; GitHub Actions met ce cache de côté entre les exécutions.
- La QA et Pages partagent donc exactement les mêmes modèles sans npm, pip,
  téléchargements de sources externes ni transformations 3D par commit.
- `scripts/prepare-runtime-assets.sh` est appelé **seulement** par le chemin
  conditionnel de la QA ordinaire pour une reconstruction exceptionnelle.
