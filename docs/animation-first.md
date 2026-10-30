# Fighters — les animations décident des coups

> **Décision de conception : animation d'abord, jeu ensuite.** Aucun combo, coup spécial ni coup « normal » n'est promis avant de voir une animation réaliste qui peut le représenter. Les **71 gestes historiques** restent des scénarios de stress-test du moteur, pas un roster jouable.

## Base compacte et superposition des mouvements (30 octobre 2026)

La [présélection initiale de 60 clips](../assets/mixamo-shortlist.json) venait des descriptions des **299 GLB privés déjà convertis** ; trois pas arrière ont été ajoutés ensuite. **Le 30 octobre 2026, Léon a regardé les prévisualisations et conservé les 63 animations, en validant les noms d'origine.** [Manifeste de sélection et identités exactes](../assets/mixamo-selected.json). Cette décision valide les mouvements source pour l'intégration, mais aucun GLB n'est encore retargeté ni intégré au jeu.

- **Bas du corps :** locomotion avant/arrière, saut, réception et appuis. **Haut du corps :** une frappe peut se superposer sans effacer les jambes, via des pistes d'os disjointes dans `src/render/animation-layers.ts`.
- **Bassin et translation :** restent prioritaires à la locomotion et à la simulation autoritative. Les déplacements réels `xMm/yMm`, la gravité, les hitboxes et les contacts sont calculés à 60 Hz. Le root motion d'un GLB ne déplace pas la simulation.
- **Réglages par coup approuvé :** `groundMovementPercent` (0–100), `airControlPercent` (0–100), `animationLayer` (`upperBody` ou `fullBody`), `allowJumpDuringAttack`. Le dernier exige `upperBody` et ne permet qu'un saut par attaque.
- **Compatibilité :** un coup de poing peut avoir une variante marchée/reculée/aérienne si la combinaison est visuellement crédible. Les grands coups de pied, balayages, projections et gestes qui dépendent des hanches gardent généralement un clip complet. Les transitions, appuis et glissements restent à examiner pour chaque combattant ; **on ne promet pas le produit cartésien de toutes les animations**.
- **Chargement :** l'animation de locomotion de base doit exister avec son nom exact (`idle`, `walk`, `jump`, ou `walkBack` via mapping explicite). Une animation de frappe absente n'est jamais remplacée silencieusement. Le rendu actuel sait combiner des pistes du haut et du bas du corps, mais aucun GLB approuvé n'a encore permis de valider cette fonction à l'écran.

La sélection des vidéos source est terminée : **63 sur 63 à conserver**. La prochaine revue doit mesurer les clips GLB retargetés, vérifier si leurs pistes couvrent proprement les deux zones, puis soumettre les combinaisons réellement rendues à Léon. Les manifestes de sélection, d'inventaire et d'approbation runtime restent **séparés**.

## Ordre obligatoire (top-down)

1. **Découvrir des clips réels** sur Mixamo ou d'autres sources documentées. Noter nom exact, URL, identifiant, auteur, variante, rig et conditions d'usage. Les 70 rôles de recherche dans `assets/mixamo-catalog.json` sont de simples mots-clés, jamais des preuves de disponibilité.
2. **Acquérir légalement puis retargeter** la sélection vers chaque modèle 3D retenu, avec contrôle visuel sur les corps masculins et féminins. Source FBX hors du dépôt public si redistribution brute non autorisée.
3. **Regarder chaque animation** en vue de côté, gauche/droite, normale/ralentie. Classer l'intention physique réellement visible : jab, crochet, genou, coup de pied haut, garde, etc. Rejeter les gestes mous, déformés, imprécis ou peu lisibles à 60 FPS.
4. **Mesurer les frames** dans le clip retargeté et optimisé : durée totale, première et dernière frame de contact, FPS, stabilité des pieds, trajectoire du bras ou de la jambe et recovery. Le module `src/game/animation-first.ts` convertit ces points temporels en ticks à 60 Hz ; le clip ne modifie jamais directement la simulation.
5. **Seulement ensuite attribuer une commande** (LP/MP/HP/LK/MK/HK, direction, accord, quart de cercle, etc.) et des propriétés de combat cohérentes : portée, hauteur, dégâts, hitstun. Un mouvement « spécial » n'est disponible que si **son animation est réellement convaincante**.
6. **Autoriser manuellement des combos** lorsque deux clips compatibles existent, que la transition a été jugée belle, que les fenêtres de contact fonctionnent et que l'IA contre IA joue correctement. Une destination de cancel non disponible est automatiquement retirée.
7. **Valider dans le véritable GLB** tous les noms de clips des attaques **et** les bases (`idle`, `walk`, `jump`, `crouch`, `hitstun`, `blockstun`, `ko`). Aucun coup n'est substitué silencieusement par l'animation idle. Ensuite tester en vrai via WebSuite et demander à Léon l'évaluation visuelle.

## Manifestes séparés

- `assets/mixamo-catalog.json` : **recherche**, source possible, état `search_pending`. Ce fichier n'autorise aucun coup.
- `assets/mixamo-selected.json` : **63 animations retenues par Léon** d'après leurs vidéos source ; noms, identifiants et empreintes exacts, sans statut d'approbation runtime.
- `assets/animation-inventory.json` : **preuve exploitable par combattant**. Sa liste `clips` démarre vide, à juste titre : aujourd'hui, aucun clip n'est intégré.
- `src/game/move-catalog.ts` : **fixture de simulation** pour tester la richesse des inputs et cancels, aucun lien automatique vers la production.
- `src/game/animation-first.ts` : **seule source des attaques de production**. Il filtre les clips approuvés avec provenance, retargeting et visionnage réussis ; les durées et contacts viennent de l'analyse réelle.

## Ajouter un coup après avoir acquis un vrai fichier

Pour chaque entrée de `animation-inventory.json`, renseigner :

- `id`, `fighterId`, `runtimeClipName` (exactement le `AnimationClip.name` du GLB final).
- `source.provider`, `source.url`, `source.originalTitle`, `source.sha256` et les décisions explicites sur licence, usage dans le jeu et présence éventuelle du fichier source dans le dépôt.
- `review.status = approved` uniquement si un humain a vraiment vu l'animation sur la **bonne morphologie**, avec `reviewer`, `retargeting = passed` et `visualPlayback = passed`.
- `framesPerSecond` entier, `totalFrames`, `contactStartFrame` et `contactEndFrame` (indices commençant à zéro, fin de contact incluse). Le pipeline en déduit **startup, active et recovery** au rythme fixe de 60 Hz.
- `move` : ID stable, bouton(s), posture et motion au besoin, dégâts, portée, niveau de garde, stun et éventuelle liste `approvedCancels` validée clip à clip.

Une entrée sans licence attestée, checksum, retargeting convaincant, bonne animation chargée et mesure des contacts doit rester `pending` ; le moteur de jeu **ne l'expose pas**. Des données inventées ne comptent pas comme preuves. La structure exige la vérification, mais **ne prouve pas à elle seule** que l'humain a réellement effectué le contrôle.

Si le clip d'attaque est excellent mais le retargeting mauvais sur un autre personnage, il ne crée **aucun coup** pour ce personnage. Les arsenaux sont donc naturellement propres aux combattants.

## Objectif de variété

Chercher autant de styles et de combinaisons que la qualité des animations peut soutenir — notamment des coups de femmes crédibles, et pas des séquences simplement accélérées ou recyclées. Il vaut mieux un large arsenal **authentiquement animé** que 71 commandes déclenchant les mêmes trois gestuelles.

Le banc IA contre IA valide mécaniquement tous les coups approuvés, puis un duel WebGL avec les vrais personnages doit être regardé en temps réel. Aucun score automatique ne peut prouver que le combat est excitant.
