# Modèles et ressources du jeu

L'ajout de ressources n'exige **pas** de retélécharger et de convertir tous les
modèles à chaque déploiement. Deux catégories existent :

1. **Fichiers légers, directement utilisés** : ajouter le modèle ou le son sous
   `docs/models/` ou `docs/sounds/`, avec son attribution et le code qui le charge.
   GitHub Pages et la QA incluent déjà ces dossiers. Éviter d'utiliser un nom
   écrasé par le paquet généré.
2. **Fichiers volumineux ou à transformer** (compression, découpage,
   harmonisation de modèles, etc.) : conserver la source dans le dépôt si sa
   taille le permet, sinon enregistrer une URL stable et son empreinte SHA-256
   dans le script d'importation. Ajouter les étapes nécessaires dans
   `scripts/prepare-runtime-assets.sh`. Ne jamais dépendre d'une URL changeante
   sans vérification d'intégrité ou oublier les conditions de licence.

## Publier une nouvelle version (sans PR)

1. Pousser les sources et les scripts de transformation sur `main`.
2. Ouvrir **Actions → Rebuild and publish a new runtime asset version → Run
   workflow**, et entrer la prochaine version (`v2`, puis `v3`, etc.).
3. Le job reconstruit les modèles, exécute les tests Node et les trois groupes
   Chrome (`visual`, `economy`, `combat`). Si un test échoue, rien n'est publié.
4. Si tout passe, le job crée une **GitHub Release versionnée**, écrit la nouvelle
   version et son SHA-256 dans `assets/runtime-assets.lock`, puis déclenche la
   QA et la publication Pages. Il ne force jamais de mise à jour de `main`.

Les versions publiées sont conservées ; elles ne sont jamais écrasées. Pour
revenir à une version antérieure, restaurer sa valeur de `tag`, `archive` et
`sha256` dans le fichier `assets/runtime-assets.lock`.

## Pendant le développement ordinaire

- `scripts/use-pinned-runtime-assets.sh` restaure le paquet préconstruit dont
  l'empreinte correspond au verrou. Un ZIP déjà présent sous `.cache/fighters/`
  est réutilisé ; GitHub Actions met ce cache de côté entre les exécutions.
- La QA et Pages partagent donc exactement les mêmes modèles sans npm, pip,
  téléchargements de sources externes ni transformations 3D par commit.
- `scripts/prepare-runtime-assets.sh` reste l'outil **de reconstruction** lors
  de l'ajout ou de la modification des ressources. Ce n'est plus le chemin
  de déploiement quotidien.
