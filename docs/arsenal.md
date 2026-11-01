# Arsenal de production

**Quatre attaques avec dégâts sont jouables dans la démo, mais aucune n’est encore approuvée pour le jeu final.** Chaque GLB contient 88 clips : 86 Quaternius CC0 et deux kicks ACCAD CC BY 3.0. En haut de l’écran tactile : jab (`UAL1_Punch_Jab`, 12 dégâts) et cross (`UAL1_Punch_Cross`, 20 dégâts). En bas : front kick (`ACCAD_Front_Kick`, 18 dégâts) et roundhouse (`ACCAD_Roundhouse_Kick`, 23 dégâts). Les fenêtres, hauteurs et distances de contact sont des **réglages provisoires explicités et testés** dans `src/engine/beat-combat.ts`.

L’inventaire d’attaques de production (`assets/animation-inventory.json`) reste **vide** jusqu’à une revue des trajectoires, contacts, timings et des trois morphologies.

Les coups de la démo passent par le moteur réel à 60 Hz, avec PV, stun, KO, IA et victoire/défaite. Voir [animation-first.md](animation-first.md).
