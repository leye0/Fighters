# Fighters — les animations décident des coups

La règle du projet est **animation-first** : un coup de production n’existe que si une animation correspondante est réellement présente sur le modèle, si les contacts et le retargeting ont été vérifiés, et si la provenance et les droits sont documentés.

Les **86 animations CC0 de Quaternius par personnage** constituent une bibliothèque de mouvement disponible : marche, course, saut, coups de poing, crochet, impacts et autres actions. Elles ne créent pas automatiquement 86 coups jouables. Le catalogue des clips exacts est dans les GLB ; leur pipeline est documenté dans [quaternius-pipeline.md](quaternius-pipeline.md).

## Règles

1. La simulation autoritative conserve X, Z, Y, orientation, collisions et dégâts à 60 Hz ; le clip ne déplace pas le monde.
2. Pour une frappe, choisir un clip réel sur **chaque personnage**, examiner sa posture et ses contacts, mesurer les fenêtres temporelles et tester l’interaction avec la locomotion.
3. Remplir `assets/animation-inventory.json` avec le nom exact du clip, URL source, SHA, licence, rig, mesures, revue visuelle et propriété de combat. Une entrée non approuvée ne crée aucun mouvement de gameplay.
4. Ne jamais **homologuer** dégâts ou combos à partir d’un nom de clip. La démo F/G/H est une étape testable : `src/engine/beat-combat.ts` fixe explicitement des fenêtres, profondeurs et dégâts provisoires, sans approbation des contacts du rig. Le code les distingue de l’inventaire de production, qui reste vide.
5. Les tests de combats déterministes et les captures navigateur prouvent le déclenchement mécanique des coups ; conserver séparée la revue visuelle des contacts par clip et personnage.

Le système de combat de la démo est celui du vrai monde 3D, pas un moteur de duel de test parallèle. Son équilibrage sera modifié après les observations de jeu réelles.
