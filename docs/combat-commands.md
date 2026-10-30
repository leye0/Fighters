# Fighters — commandes de combat

**71 scénarios fictifs de tests de simulation**, répartis entre poings, pieds, coups accroupis et
aériens, attaques directionnelles, accords de plusieurs touches, spéciaux et supers.
Voir le [catalogue complet](arsenal.md) et la [liste filtrable du navigateur](../index.html).

Ces commandes sont des **exemples pour valider le moteur déterministe à 60 ticks/s**, pas un contrat de commandes finales. Dans le vrai jeu, les mouvements et leurs combinaisons **seront décidés après examen des animations effectivement disponibles**, séparément pour chaque personnage. Voir [animation-first](animation-first.md).

## Clavier

| Action | Joueur 1 | Joueur 2 |
| --- | --- | --- |
| Déplacements et garde | W A S D | Flèches |
| Poing faible / moyen / fort | J / K / L | Pavé numérique 1 / 2 / 3 |
| Pied faible / moyen / fort | U / I / O | Pavé numérique 4 / 5 / 6 |

Les directions sont relatives à l'adversaire, avec inversion selon le côté.
Notation pavé numérique : `2` bas, `3` bas-avant, `6` avant.

| Mouvement | Séquence |
| --- | --- |
| Quart de cercle avant | `236` |
| Quart de cercle arrière | `214` |
| Dragon-punch | `623` |
| Dragon-punch inversé | `421` |
| Demi-cercle avant | `41236` |
| Demi-cercle arrière | `63214` |
| Double quart de cercle avant | `236236` |
| Double quart de cercle arrière | `214214` |
| Cercle, raccourci 270° compatible joystick | `632147` |

Exemples : `↓ ↘ → + MP` = Surge Punch ; `→ ↓ ↘ + HP` = Rising Uppercut ;
`LP + LK` appuyés simultanément = Palm and Knee ;
`↓ + LP` = Crouch Jab ;
`AIR + MP` = Air Cross ;
`→ ↘ ↓ ↙ ← ↖ + HK` = Ring of Fire.

## Priorité, combos et animations

- Les frappes initiales et cancels sont résolus **dans la simulation** sur des
  commandes temporisées. Les coups ayant touché peuvent enchaîner uniquement
  vers les `cancelInto` autorisés, dans leurs fenêtres de frames.
- Un chord (touches simultanées), une commande directionnelle ou un mouvement
  spécial applicable prend la priorité définie par les données ; en cas d'égalité,
  la séquence la plus spécifique l'emporte.
- L'historique d'orientation à 32 ticks fait partie de l'état et peut être rejoué.
  Le mouvement ordinaire doit terminer dans les quatre ticks et respecte une
  fenêtre normale de 16 ticks ; les supers longs peuvent en avoir 30.
- Les coups aériens continuent de subir la gravité et limitent les contacts selon
  la séparation verticale réelle des combattants.
- Chaque attaque possède un `animationRole`. Le renderer choisit en priorité
  un mapping spécifique au combattant, puis le rôle partagé, et met le clip à
  l'échelle du temps de startup/active/recovery. Il **n'invente aucun clip manquant**.

Le [catalogue d'animations Mixamo recherchées](../assets/mixamo-catalog.json)
contient 70 mots-clés de recherche, tous `search_pending`. Aucun fichier de combat Mixamo n'a encore été approuvé et intégré ; l'[inventaire de production](../assets/animation-inventory.json) est vide.

## Ce qui reste

Tolérance aux pressions quasi simultanées, buffer d'input, dash, charges,
projections réelles, cancels aériens complexes, rounds, super jauge, hitstop,
projectiles et validation visuelle du timing des modèles 3D.
