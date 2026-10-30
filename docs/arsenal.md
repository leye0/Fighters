# Fighters — banc de simulation : 71 gestes hypothétiques (non jouables en production)

> **Important :** les 71 entrées sont des **fixtures synthétiques pour tester le moteur** (inputs, collisions, cancels et physique), pas des coups réellement proposés par le jeu. Zéro animation Mixamo est actuellement intégrée. **La production suit l'[architecture animation-first](animation-first.md)** : seul le geste d'un vrai clip approuvé déterminera un coup, sa commande et son timing. Voir [pipeline Mixamo](mixamo-integration.md) et le [plan](production-plan.md).

Commandes relatives à l'adversaire, vues pour un combattant tourné vers la droite. Les flèches s'inversent automatiquement pour le joueur à droite. `LP/MP/HP` = poing faible/moyen/fort, `LK/MK/HK` = pied faible/moyen/fort. `+` entre boutons signifie **appuyer en même temps**. Cette fixture générique est partagée par les combattants fictifs des tests ; **les personnages de production auront chacun un arsenal distinct issu de leurs animations approuvées**.

| Identifiant | Famille | Commande | Dégâts | Rôle d'animation requis | Cancellables vers… |
| --- | --- | --- | ---: | --- | --- |
| `jab` | Normal | LP | 6 | `jab` | `straight`, `hook`, `surge-punch` |
| `straight` | Normal | MP | 9 | `cross` | `hook`, `round-kick`, `surge-punch` |
| `hook` | Normal | HP | 14 | `hook` | `rising-uppercut` |
| `low-kick` | Normal | LK | 5 | `low_kick` | `round-kick`, `cyclone-kick` |
| `round-kick` | Normal | MK | 10 | `roundhouse_kick` | `high-kick`, `surge-punch` |
| `high-kick` | Normal | HK | 17 | `high_kick` | — |
| `crouch-jab` | Accroupi | ↓ + LP | 5 | `crouching_jab` | `crouch-cross`, `sweep` |
| `crouch-cross` | Accroupi | ↓ + MP | 10 | `crouching_cross` | `sweep` |
| `crouch-hook` | Accroupi | ↓ + HP | 16 | `crouching_hook` | — |
| `shin-tap` | Accroupi | ↓ + LK | 5 | `crouching_low_kick` | `sweep` |
| `sweep` | Accroupi | ↓ + MK | 12 | `crouching_sweep` | — |
| `leg-reaper` | Accroupi | ↓ + HK | 19 | `sweep` | — |
| `air-jab` | Aérien | AIR + LP | 5 | `air_jab` | — |
| `air-cross` | Aérien | AIR + MP | 10 | `air_cross` | — |
| `air-hook` | Aérien | AIR + HP | 16 | `air_hook` | — |
| `air-knee` | Aérien | AIR + LK | 5 | `jumping_knee` | — |
| `air-front-kick` | Aérien | AIR + MK | 10 | `air_front_kick` | — |
| `air-heel-kick` | Aérien | AIR + HK | 16 | `flying_kick` | — |
| `advancing-palm` | Directionnel | → + LP | 5 | `palm_strike` | — |
| `elbow-drive` | Directionnel | → + MP | 10 | `elbow_strike` | — |
| `overhand-smash` | Directionnel | → + HP | 16 | `overhand_punch` | — |
| `knee-drive` | Directionnel | → + LK | 5 | `knee_strike` | — |
| `push-kick` | Directionnel | → + MK | 10 | `front_kick` | — |
| `axe-kick` | Directionnel | → + HK | 16 | `axe_kick` | — |
| `retreating-jab` | Directionnel | ← + LP | 5 | `jab` | — |
| `counter-cross` | Directionnel | ← + MP | 10 | `cross` | — |
| `backfist` | Directionnel | ← + HP | 16 | `spinning_backfist` | — |
| `heel-stomp` | Directionnel | ← + LK | 5 | `heel_kick` | — |
| `side-kick` | Directionnel | ← + MK | 10 | `side_kick` | — |
| `turning-heel` | Directionnel | ← + HK | 16 | `back_kick` | — |
| `palm-and-knee` | Touches combinées | LP + LK | 10 | `knee_strike` | — |
| `hammer-combination` | Touches combinées | MP + MK | 16 | `hammerfist` | — |
| `spinning-crush` | Touches combinées | HP + HK | 16 | `spinning_kick` | — |
| `low-double-kick` | Touches combinées | LK + MK | 10 | `kick_combo` | — |
| `cross-body-strike` | Touches combinées | LP + MK | 10 | `body_punch` | — |
| `heavy-breaker` | Touches combinées | LP + HP + HK | 25 | `guard_break` | — |
| `surge-punch` | Spécial | ↓ ↘ → + MP | 16 | `cross` | — |
| `rising-uppercut` | Spécial | → ↓ ↘ + HP | 22 | `uppercut` | — |
| `low-wave-kick` | Spécial | ↓ ↘ → + LK | 18 | `low_kick` | — |
| `cyclone-kick` | Spécial | ↓ ↘ → + HK | 18 | `spinning_kick` | — |
| `body-rush` | Spécial | ↓ ↘ → + LP | 18 | `body_punch` | — |
| `crushing-knee` | Spécial | ↓ ↘ → + MK | 18 | `knee_strike` | — |
| `retreat-spin` | Spécial | ↓ ↙ ← + HK | 18 | `back_kick` | — |
| `reverse-hook` | Spécial | ↓ ↙ ← + HP | 18 | `hook` | — |
| `guard-splinter` | Spécial | ↓ ↙ ← + MP | 18 | `palm_strike` | — |
| `low-scorpion` | Spécial | ↓ ↙ ← + LK | 18 | `sweep` | — |
| `reverse-elbow` | Spécial | ↓ ↙ ← + LP | 18 | `elbow_strike` | — |
| `skipping-kick` | Spécial | ↓ ↙ ← + MK | 18 | `side_kick` | — |
| `thunder-palm` | Spécial | → ↓ ↘ + MP | 18 | `palm_strike` | — |
| `anti-air-knee` | Spécial | → ↓ ↘ + LK | 18 | `jumping_knee` | — |
| `heel-breaker` | Spécial | → ↓ ↘ + HK | 18 | `heel_kick` | — |
| `reverse-uppercut` | Spécial | ← ↓ ↙ + HP | 18 | `uppercut` | — |
| `reverse-palm` | Spécial | ← ↓ ↙ + LP | 18 | `palm_strike` | — |
| `reverse-high-kick` | Spécial | ← ↓ ↙ + MK | 18 | `high_kick` | — |
| `rolling-crush` | Spécial | ← ↙ ↓ ↘ → + HP | 22 | `spinning_backfist` | — |
| `half-moon-kick` | Spécial | ← ↙ ↓ ↘ → + HK | 21 | `roundhouse_kick` | — |
| `circular-palm` | Spécial | ← ↙ ↓ ↘ → + LP | 18 | `palm_strike` | — |
| `low-crescent` | Spécial | ← ↙ ↓ ↘ → + LK | 18 | `low_kick` | — |
| `counter-wheel` | Spécial | → ↘ ↓ ↙ ← + MP | 18 | `cross` | — |
| `backward-crescent` | Spécial | → ↘ ↓ ↙ ← + MK | 18 | `spinning_kick` | — |
| `heel-sweep` | Spécial | → ↘ ↓ ↙ ← + HK | 18 | `sweep` | — |
| `double-crushing-hook` | Super | ↓ ↘ → ↓ ↘ → + HP | 26 | `hook` | — |
| `meteor-fist` | Super | ↓ ↘ → ↓ ↘ → + MP | 26 | `cross` | — |
| `thunder-low-kicks` | Super | ↓ ↘ → ↓ ↘ → + LK | 26 | `kick_combo` | — |
| `sky-breaker` | Super | ↓ ↘ → ↓ ↘ → + HK | 26 | `flying_kick` | — |
| `final-palm` | Super | ↓ ↙ ← ↓ ↙ ← + LP | 26 | `palm_strike` | — |
| `blackout-kick` | Super | ↓ ↙ ← ↓ ↙ ← + MK | 26 | `roundhouse_kick` | — |
| `reverse-storm` | Super | ↓ ↙ ← ↓ ↙ ← + HP | 26 | `spinning_backfist` | — |
| `ring-of-fire` | Super | → ↘ ↓ ↙ ← ↖ + HK | 26 | `spinning_kick` | — |
| `whirlwind-fist` | Super | → ↘ ↓ ↙ ← ↖ + HP | 26 | `spinning_backfist` | — |
| `bodyquake` | Super | → ↘ ↓ ↙ ← ↖ + MP | 26 | `body_punch` | — |

## Enchaînements déjà exécutables dans la simulation

- Jab → Straight : donner un **jab LP** à portée puis presser **MP** durant la fenêtre de cancel.
- Straight → Hook : un direct **MP** ayant touché peut être annulé vers **HP**.
- Crouch jab → Crouch cross : tenir ↓ et enchaîner LP puis MP après le contact.
- Les coups spéciaux détectés sont priorisés sur les coups normaux compatibles ; une commande plus spécifique peut remplacer une attaque normale.
- Un cancel n'est autorisé qu'après **contact** et dans la fenêtre temporelle propre au coup ; une attaque ratée ne permet pas de tricher avec un cancel.

## Règles encore à construire

- Coup à distance avec véritable projectile, projections et échappements, invincibilité, knockdown, hitstop, jauge d'EX, 360 avec charge, dash à double impulsion et combos aériens avancés.
- Latence tolérante aux touches presque simultanées, remappage complet et buffer d'input de tournoi.
- Clips Mixamo réellement acquis, retargetés et synchronisés aux frames du coup, sons d'effort, impacts et réactions ; contrôle visuel par Léon.

Les paramètres de timing et dégâts sont des valeurs de départ **à équilibrer à l'observation** des duels IA contre IA et des parties humaines, pas des données officielles d'un autre jeu.
