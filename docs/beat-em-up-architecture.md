# Fighters — architecture du beat’em up 3D

## Direction

Le jeu principal est un beat’em up solo 3D à défilement horizontal : rues, profondeur jouable, plateformes, sauts, bâtiments et plusieurs ennemis. Le décor technique actuel utilise des volumes simples pendant la mise en place des mécanismes.

**L’orientation suit exclusivement gauche/droite**, jamais la cible technique. Le héros reste exactement centré sur les deux axes écran tant que la caméra n’atteint pas une frontière de scrolling. Les limites gauche, droite, haute et basse sont indépendantes. L’héroïne et les adversaires peuvent **se traverser** : aucune collision solide ou pushbox acteur–acteur, décision explicite du propriétaire.

## Monde déterministe

- Simulation à **60 ticks/s** en millimètres entiers.
- **X :** progression le long de la rue. **Z :** profondeur. **Y :** hauteur et gravité.
- Supports et plateformes définis par données X/Z/Y ; franchissement, saut, réception, chute et descente volontaire par règles explicites.
- Déplacement cinématique avec accélération et freinage, contrôle aérien limité, sans solveur général de rigid bodies.
- Cibles proches avec hystérésis : utiles pour les IA et hitboxes, sans modifier la direction du corps.
- Caméra 3D PerspectiveCamera basée sur le héros et non sur la moyenne des combattants.

## Personnages et animations

Les trois vrais modèles sont Claudia (héroïne), Carla (héroïne alternative), Realistic Man (ennemis multiples). Chaque skin reçoit **86 animations CC0 Quaternius Standard** directement sur son squelette via le pipeline documenté dans [quaternius-pipeline.md](quaternius-pipeline.md).

Le contrôleur `BeatCharacterAnimator` sélectionne les clips de repos, marche, départ de saut, boucle aérienne, réception, frappes F/G/H, impacts et mort. La **simulation autoritative** décide des positions/contacts, et non les animations Three.js.

Le moteur `beat-combat.ts` calcule les points de vie et les réactions sur des volumes X/Z/Y à 60 Hz, sans pushbox. Les ennemis utilisent les mêmes coups et règles, avec des intentions d’IA déterministes. Les fenêtres actives et distances sont **temporaires pour la démo** ; une revue des contacts exacts sur les trois vrais squelettes reste à faire.

## État de réalisation

- **Présents :** navigation X/Y/Z, deux ennemis avec IA de déplacement/attaque, PV et KO, plateformes, scrolling, orientation gauche/droite, contrôles clavier/tactile/manette, vraie scène Three.js, trois GLB humains, 86 clips par rig, sélection Claudia/Carla, trois coups avec contacts provisoires et écran victoire/défaite.
- **À contrôler :** QA WebGL du combat, rendus en vrai WebGL/mobile, appuis, cadence, bras, contacts et caméra.
- **À produire :** arsenal et fenêtres de contact approuvés, combos, gardes, enrichissement d’IA de groupe, niveaux complets, audio, effets et décors photoréalistes.

Les tests structurels et les statistiques ne remplacent pas la vérification visuelle et le jugement du propriétaire. Voir [production-plan.md](production-plan.md).
