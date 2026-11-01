# Animations intégrées aux personnages

Ces trois fichiers de jeu sont construits automatiquement à partir de deux bibliothèques **Quaternius Universal Animation Library Standard**, sous licence **CC0** :

- `claudia.glb` — modèle original riggé **Claudia** de Renderpeople, CC BY + 86 clips Quaternius.
- `carla.glb` — modèle original riggé **Carla** de Renderpeople, CC BY + 86 clips Quaternius.
- `realistic-man.glb` — modèle original riggé **Realistic Man** de J.azali, CC BY + 86 clips Quaternius.

Les 86 noms de clips commencent par `UAL1_` ou `UAL2_`. Les fichiers conservent les géométries, matériaux, textures et squelettes du modèle de chaque personnage, sans animations antérieures. Une propriété `fightersMotionSource` dans le GLB identifie les deux archives d’animation et le personnage.

Vérifier avec `npm run animation:verify`. Le générateur et les SHA des deux ZIP sont dans [docs/quaternius-pipeline.md](../../docs/quaternius-pipeline.md).

La démo utilise repos, locomotion, saut, trois attaques, réactions et mort. Les trois attaques calculent des dégâts avec des fenêtres provisoires documentées dans `src/engine/beat-combat.ts` ; la présence d'un clip ne constitue **pas** une approbation des contacts visuels ou des combos pour le jeu final.
