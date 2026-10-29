# Fighters — commandes de combat

Les règles ci-dessous sont **implémentées et testées dans le noyau déterministe**.
Cela ne signifie pas que les animations et les modèles photoréalistes soient intégrés.

## Clavier

| Action | Joueur 1 | Joueur 2 |
| --- | --- | --- |
| Déplacement | W A S D | Flèches |
| Poings faible / moyen / fort | J / K / L | Pavé numérique 1 / 2 / 3 |
| Pieds faible / moyen / fort | U / I / O | Pavé numérique 4 / 5 / 6 |

La direction est relative au combattant : en notation pavé numérique,
`2` = bas, `3` = bas-avant, `6` = avant.

| Coup | Commande | Bouton | Paramètres effectivement simulés |
| --- | --- | --- | --- |
| Surge punch | `236`, quart de cercle avant | MP | Mêlée, startup 8 ticks, 16 dégâts |
| Rising uppercut | `623`, dragon-punch | HP | Mêlée haute, startup 5 ticks, 22 dégâts |

Ce sont des coups par données, communs pour l'instant au roster ; ni projectile,
ni déplacement vertical, ni invincibilité, ni animation spécifique ne sont simulés
sans leur implémentation réelle.

## Sémantique déterministe

- Simulation à **60 ticks/s**, indépendante du rendu Three.js.
- L'historique borné à 32 ticks est inclus dans `MatchState` pour les replays.
- Seules les transitions directionnelles sont enregistrées : garder `6` enfoncé
  ne rallonge pas artificiellement le délai d'un quart de cercle.
- Les mouvements sont trouvés dans une fenêtre de 16 ticks ; leur direction
  terminale doit être récente (quatre ticks ou moins).
- Les touches d'attaque ne comptent que sur l'appui initial (front montant).
- Si plusieurs coups spéciaux correspondent, `commandPriority` l'emporte,
  puis la longueur de la commande, puis l'ordre stable des définitions.
- Un mouvement incomplet ou périmé utilise le coup normal de ce bouton.
- Le changement de côté efface l'historique dépendant de l'orientation.
- Les coups `236` et `623` sont branchés au moteur. Les mouvements de
  demi-cercle et double quart de cercle ont une reconnaissance disponible ;
  la démonstration testée de priorité est la commande double quart de cercle.

## Vérification

`tests/specials.test.ts` vérifie le coup normal, les mouvements valides,
l'inversion des côtés, l'ordre invalide, l'expiration, la priorité,
la non-mutation, la limitation de l'historique et les replays.

## Travail prévu

Commandes de charge et 360°, input buffering, remappage, dash, cancels,
juggles, hitstop, projectiles, animations retargetées, sons et effets.
Voir `docs/production-plan.md`.
