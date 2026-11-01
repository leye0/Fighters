# Fighters — QA du combat de la démo 3D

Le **seul moteur de combat** est `src/engine/beat-combat.ts` à 60 Hz, intégré au monde 3D. Le vieux banc de duel 1v1, ses commandes et ses faux avatars ont été supprimés.

## Tests exécutables

1. `npm test` : reproductibilité des résultats, vrais noms et durées des clips, frappe dans le sens du regard, limites X/Z/Y, un impact maximum par cible et par coup, échanges simultanés, dégâts, KO, victoire et comportement IA.
2. `npm run build` : compilation de la scène réelle, HUD des PV et écran de résultat.
3. `.github/workflows/beat-webgl-qa.yml` : navigateur logiciel WebGL chargé avec **Claudia et Carla**, deux instances riggées du vrai personnage masculin, poings F/G et coups de pied H/I avec variation mesurée des PV, puis riposte ennemie avec perte des PV de l'héroïne.
4. Revoir les captures et tester manuellement dans le navigateur sur les machines cibles (PC, mobile). Le rendu logiciel CI ne mesure pas les FPS d'un iPhone.

## Limite importante

Les quatre attaques de la démo utilisent des clips Quaternius (poings) et ACCAD (pieds) qui existent réellement sur les trois squelettes. Les fenêtres de contact, distances, stun et dégâts dans `DEMO_ATTACKS` sont **des valeurs provisoires**, pas des timings approuvés à l'image près. Les assertions automatisées ne prouvent ni la crédibilité des impacts ni le plaisir de jeu. Léon doit tester les coups à vitesse réelle et juger leur poids, leur lisibilité, les appuis, la variété et la réactivité des deux ennemis.

La prochaine étape est de réviser sur images les contacts des trois morphologies et d'inscrire les coups jugés acceptables dans `assets/animation-inventory.json`. Les jauges et les KO sont fonctionnels dans la démo ; l'arsenal de production reste ouvert.
