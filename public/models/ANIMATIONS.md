# Animations intégrées aux personnages

Ces trois fichiers de jeu sont construits automatiquement à partir de deux bibliothèques **Quaternius Universal Animation Library Standard** sous **CC0**, et deux vrais coups de pied du projet **ACCAD / The Ohio State University** sous **CC BY 3.0** :

- `claudia.glb` — modèle original riggé **Claudia** de Renderpeople, CC BY + 88 clips sous licences CC0/CC BY.
- `carla.glb` — modèle original riggé **Carla** de Renderpeople, CC BY + 88 clips sous licences CC0/CC BY.
- `realistic-man.glb` — modèle original riggé **Realistic Man** de J.azali, CC BY + 88 clips sous licences CC0/CC BY.

Les 86 noms de clips Quaternius commencent par `UAL1_` ou `UAL2_` ; les deux kicks `ACCAD_Front_Kick` et `ACCAD_Roundhouse_Kick` sont sous CC BY 3.0. **Attribution obligatoire : Open Motion Project by ACCAD / The Ohio State University — CC BY 3.0.** Les fichiers conservent géométries, matériaux, textures et squelettes de chaque personnage, sans animations antérieures. Une propriété `fightersMotionSource` identifie les archives, empreintes, licences et personnage.

Vérifier avec `npm run animation:verify`. Le générateur et les SHA des trois ZIP sont dans [docs/quaternius-pipeline.md](../../docs/quaternius-pipeline.md).

La démo utilise repos, locomotion, saut, quatre attaques (deux poings/deux pieds), réactions et mort. Les quatre attaques calculent des dégâts avec des fenêtres provisoires documentées dans `src/engine/beat-combat.ts` ; la présence d'un clip ne constitue **pas** une approbation des contacts visuels ou des combos pour le jeu final.
