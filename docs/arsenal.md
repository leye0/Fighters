# Arsenal de production

**Trois attaques avec dégâts sont jouables dans la démo, mais aucune n’est encore approuvée pour le jeu final.** Les GLB de Claudia, Carla et Realistic Man contiennent chacun 86 clips CC0. Trois clips sont associés aux commandes F/G/H : jab (`UAL1_Punch_Jab`, 12 dégâts), cross (`UAL1_Punch_Cross`, 20 dégâts) et crochet (`UAL2_Melee_Hook`, 16 dégâts). Les fenêtres, hauteurs et distances de contact sont des **réglages provisoires explicités et testés** dans `src/engine/beat-combat.ts`.

L’inventaire d’attaques de production (`assets/animation-inventory.json`) reste **vide** jusqu’à une revue des trajectoires, contacts, timings et des trois morphologies.

Les coups de la démo passent par le moteur réel à 60 Hz, avec PV, stun, KO, IA et victoire/défaite. Voir [animation-first.md](animation-first.md).
