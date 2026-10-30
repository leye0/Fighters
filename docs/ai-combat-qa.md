# Fighters — QA d'un combat IA contre IA

## Objectif

Repérer les combats qui sont techniquement valides mais **ennuyeux, irréalistes ou injouables**.
Le banc automatique produit des signaux de rythme ; la validation du « fun »
et du photoréalisme nécessite impérativement le visionnement d'un match animé.

## Test déterministe sans GPU — disponible

- Lancer `npm run simulate:ai` (Node.js 24). Cinq combats complets sont exécutés
  avec les mêmes `InputFrame`, collisions, gardes, coups et ticks à 60 Hz
  que le jeu humain. Un avertissement provoque un code de sortie non nul.
- `npm run test:ai` exécute les tests de reproductibilité et de couverture.
- Profils initiaux : `aggressive`, `balanced`, `defensive`. Les règles de
  dégâts, vitesses, commandes et hitboxes sont identiques pour les joueurs et l'IA.
- L'IA ne lit pas les commandes futures : elle échantillonne les états visibles
  de l'adversaire avec un délai de réaction propre au profil.
- Rapport : durée en secondes et ticks, KO ou plafond, vie restante, attaques
  par combattant, touches, gardes, attaques spéciales et temps maximal sans contact.

### Alertes automatiques initiales

| Signal | Avertissement |
| --- | --- |
| Issue | Aucun KO avant 90 s par défaut |
| Participation | Un combattant tente moins de quatre attaques |
| Contacts | Moins de six touches/gardes combinées |
| Stagnation | Plus de 12 s sans contact |
| Variété | Moins de deux coups spéciaux combinés |

Ces seuils sont des **heuristiques de diagnostic**, pas une preuve de plaisir ni
un équilibrage définitif. Les résultats sont à revoir quand les règles de rounds,
les projectiles, les coups et les personnages évolueront.

### Valeurs observées au 29 octobre 2026

Pour cinq paires de graines de référence, les duels de base se sont terminés
par KO en environ 12 à 18 secondes, sans alerte automatique. Les tests de trois
profils ont aussi produit des KO. Ces chiffres ne sont pas des FPS mesurés.

## Mode navigateur — branchement présent, **validation visuelle bloquée**

Sélectionner **Mode → IA contre IA** ou utiliser `?mode=ai-vs-ai`.
Si deux modèles GLB autorisés sont disponibles, les deux agents pilotent le
même moteur à 60 Hz, l'animation 3D suit leur état et le HUD affiche leurs vies.
Sinon, le navigateur affiche honnêtement l'attente de personnages : aucun
substitut humanoïde n'est maquillé en résultat photoréaliste.

## Gate visuel/ressenti obligatoire — pas encore réalisé

- [ ] Intégrer légalement au moins deux modèles humains photoréalistes, dont un
  personnage féminin, et les animations de garde/locomotion/poings/pieds/impact.
- [ ] Exécuter plusieurs duels IA contre IA **dans le vrai navigateur WebGL**
  avec rendu Ultra ; vérifier les deux personnages, le HUD, les impacts et KO.
- [ ] Capturer plusieurs moments (idle, déplacements, attaque, contact, réaction,
  victoire) avec WebSuite, puis filmer des échanges complets.
- [ ] Observer la vitesse réelle sur une machine GPU représentative ; vérifier
  FPS, fluidité, hitchs, chargement et artefacts de shaders.
- [ ] Faire noter par Léon la lisibilité de chaque coup, la crédibilité du poids
  des corps, l'intérêt des échanges, les réflexes des agents, la variété des
  animations, l'absence de skating et le son.
- [ ] Corriger les cas où les agents passent le test numérique mais semblent
  stupides, trop précis, monotones ou sans réponse aux coups.
- [ ] Rejouer les mêmes seeds après toute modification de balancing et conserver
  les rapports ; élargir les seeds, styles, roster et arènes.

La capture WebSuite ne doit pas être considérée comme une validation autonome
de perception ; Léon garde le jugement final sur le ressenti.
