# Fighters — animation 3D automatisée et sans compte

**Seule source d’animation en production :** les deux packs gratuits *Universal Animation Library [Standard]* et *Universal Animation Library 2 [Standard]* de **Quaternius**. Leurs pages officielles identifient ces packs comme **CC0 1.0** :

- [Universal Animation Library](https://quaternius.itch.io/universal-animation-library)
- [Universal Animation Library 2](https://quaternius.itch.io/universal-animation-library-2)

Le téléchargement est nécessaire pendant la fabrication des assets. **Le jeu lui-même ne contacte aucun service d’animation** : toutes les courbes sont contenues dans trois fichiers GLB autonomes, jouables hors ligne après mise en cache des fichiers du jeu.

## Fichiers de sources reproductibles

| Pack | Source figée | SHA-256 de l’archive ZIP | GLB Standard |
| --- | --- | --- | --- |
| UAL1 | [Miroir de l’archive gratuite](https://github.com/MightyBubble/Ludots-Assets/blob/main/animations/Quaternius-Universal-Animation-Library-Standard.zip) | `cc73fc4e495b82958207316596317a3f40b9fa38065bde1027937452da537724` | `UAL1_Standard.glb` |
| UAL2 | [Miroir de l’archive gratuite](https://github.com/MightyBubble/Ludots-Assets/blob/main/animations/Quaternius-Universal-Animation-Library-2-Standard.zip) | `4008ea208a604773a2b2177d965f0f5d3195498b5bf838c3f5785d68e95f2a68` | `UAL2_Standard.glb` |

**Pourquoi ce miroir :** URL directe stable avec téléchargement non interactif sur GitHub Actions, empreinte figée et comparée avant extraction. La déclaration CC0 relève **des pages de l’auteur**, pas du miroir.

Les archives Standard contiennent chacune **43 actions nommées** dans leurs GLB sans déplacement racine, soit **86** au total. La publicité « 120+/130+ » de l’auteur couvre davantage que l’unique GLB Standard sélectionné ; Fighters documente le **nombre effectivement intégré**, pas le chiffre marketing.

## Conversion automatique

`.github/workflows/quaternius-animations.yml`, déclenché par un changement des outils sur `main` ou manuellement par le mainteneur :

1. Télécharge les deux ZIP publics sans compte, puis compare leurs SHA-256.
2. Extrait les deux GLB sources Standard, charge les trois humains déjà présents sous `public/models/`.
3. `scripts/build-quaternius-animations.mjs` reconnaît les principaux os et orientations à partir des squelettes et des poses de repos. Il applique les 86 actions à **chacun des squelettes propres** Claudia, Carla et Realistic Man ; ne transfère aucune géométrie ou texture de démonstration.
4. Retire les anciennes pistes d’animation, compacte les buffers inutilisés et écrit trois nouveaux GLB avec métadonnées `asset.extras.fightersMotionSource` et empreintes sources.
5. `scripts/check-quaternius-models.mjs` vérifie les licences/provenance, 86 noms distincts, les canaux sur les joints réels, la présence de la peau, les proportions anatomiques et **28 poses 3D** par personnage.
6. Typecheck, tests, build Vite ; génération de `docs/site/` puis commit ciblé sur `main` des trois GLB, de l’audit et de la page.
7. Le workflow Pages publie les fichiers produits.

Aucun compte, navigateur, export manuel, rotation anatomique propre à un personnage ou ancien rig intermédiaire n’est requis. Un échec de validation interrompt la publication : il ne substitue pas un modèle ou clip factice.

## Réalisation locale

Installer Node.js 24 et `npm ci`, télécharger les deux ZIP exacts (voir le workflow et SHA ci-dessus), extraire `UAL1_Standard.glb` et `UAL2_Standard.glb`, puis :

```bash
node scripts/build-quaternius-animations.mjs /tmp/UAL1_Standard.glb /tmp/UAL2_Standard.glb public/models /tmp/fighters-cc0
node scripts/check-quaternius-models.mjs /tmp/fighters-cc0
```

La sortie contient `claudia.glb`, `carla.glb`, `realistic-man.glb` et `quaternius-audit.json`. **Ne pas supprimer les modèles originaux CC BY et leurs attributions.** Seuls les binaires validés sont copiés vers le jeu.

## Contrôles et limitations

Les noms `UAL1_*` et `UAL2_*` couvrent marche, course, saut (départ/boucle/réception), coups, réactions et autres gestes. Les mouvements sont liés à l’animation Three.js des vrais rigs, indépendamment du monde à 60 Hz.

La validation de données/poses ne prouve pas à elle seule la **qualité perceptuelle** du retargeting, les pieds au sol, la lisibilité du contact ou la jouabilité des coups. Les gestes F/G/H infligent désormais des dégâts **dans la démo uniquement** selon des fenêtres explicites provisoires ; ce sont toujours des contacts **non approuvés pour la production** tant qu'une revue visuelle n'a pas été effectuée. Voir [production-plan.md](production-plan.md) et [animation-first.md](animation-first.md).
