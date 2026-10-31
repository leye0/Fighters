# Fighters — les animations décident des coups

La règle du projet est **animation-first** : un coup de production n’existe que si une animation correspondante est réellement présente sur le modèle, si les contacts et le retargeting ont été vérifiés, et si la provenance et les droits sont documentés.

Les **86 animations CC0 de Quaternius par personnage** constituent une bibliothèque de mouvement disponible : marche, course, saut, coups de poing, crochet, impacts et autres actions. Elles ne créent pas automatiquement 86 coups jouables. Le catalogue des clips exacts est dans les GLB ; leur pipeline est documenté dans [quaternius-pipeline.md](quaternius-pipeline.md).

## Règles

1. La simulation autoritative conserve X, Z, Y, orientation, collisions et dégâts à 60 Hz ; le clip ne déplace pas le monde.
2. Pour une frappe, choisir un clip réel sur **chaque personnage**, examiner sa posture et ses contacts, mesurer les fenêtres temporelles et tester l’interaction avec la locomotion.
3. Remplir `assets/animation-inventory.json` avec le nom exact du clip, URL source, SHA, licence, rig, mesures, revue visuelle et propriété de combat. Une entrée non approuvée ne crée aucun mouvement de gameplay.
4. Ne pas inventer de dégâts ou de combos à partir d’un nom de clip. Les gestes F/G/H actuels sont uniquement des démonstrations visuelles sans hitboxes.
5. Construire ensuite les tests d’intégration IA contre IA et les captures de rendu pour voir les vrais contacts.

Les modules de simulation indépendants peuvent proposer des scénarios de stress-test ; ceux-ci ne sont pas l’arsenal de production.
