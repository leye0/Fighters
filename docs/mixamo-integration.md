# Fighters — découverte Mixamo et arsenal dicté par les animations

**Statut actuel : aucun fichier d'animation Mixamo n'est intégré.**
Le moteur sait charger une scène GLB et des clips d'animation, mais il n'a
pas encore les animations de combat ni un retargeting fonctionnel par personnage.

La [FAQ Adobe](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html)
permet l'usage de personnages/animations Mixamo dans les jeux vidéo, y compris
commerciaux, et annonce un accès gratuit avec Adobe ID. Cela **n'autorise pas
automatiquement la republication des fichiers sources bruts** dans un dépôt
GitHub public. Vérifier les conditions applicables lors de l'acquisition.

Le [catalogue structuré des 70 pistes de recherche](../assets/mixamo-catalog.json) contient des mots-clés `search_pending` et aucun clip réel. **Il ne détermine pas les coups.** Une fois chaque animation trouvée, nous déterminons ce qu'elle montre réellement, ses points de contact, ses variantes et ses possibles enchaînements, selon [le protocole animation-first](animation-first.md). Les clips approuvés vont dans [l'inventaire de production](../assets/animation-inventory.json).

## Catalogue de gestes à acquérir et qualifier

Les termes ci-dessous sont des **besoins fonctionnels et requêtes de recherche**,
pas une affirmation que Mixamo propose un fichier portant exactement ce nom.

| Famille | Besoins |
| --- | --- |
| Postures | garde debout, garde basse, idle combat, respiration, rebond |
| Marche | avant, arrière, pas chassés, pivot, recul, dash |
| Sauts | décollage, air, réception, sauts directionnels |
| Poings | jab, direct, crochet, uppercut, body punch, enchaînements |
| Pieds | low kick, middle, high kick, front kick, roundhouse, spin kick |
| Spéciaux | frappe montante, charge offensive, attaque circulaire, recovery |
| Défense | bloc haut/bas, esquive latérale, duck, parry, recul sous impact |
| Réactions | hit tête/torse/jambes, knockback, stumble, chute |
| Sol | knockdown, récupération, relevé, KO |
| Transitions | retour garde, passage accroupi, retournement, victoire, défaite |

## Pipeline à développer et vérifier

- [ ] Authentifier Mixamo avec un Adobe ID et identifier les **véritables** clips
  utiles, leur identifiant et les variantes de vitesse et de rig.
- [ ] Créer le registre de provenance par clip : URL/ID, date, licence, statut
  de redistribution, format, checksum, cible de retargeting et crédits.
- [ ] Exporter en FBX selon les formats autorisés ; convertir en glTF/GLB
  optimisé sans dégrader les courbes de mouvement.
- [ ] Retargeter et inspecter pour morphologies variées : proportions des bras,
  hanches, pieds, mains, vêtements, et priorité aux personnages féminins.
- [ ] **Créer les attaques à partir des clips retenus**, puis attribuer les commandes et enchaînements en fonction du geste réellement visible.
- [x] Préparer le registre typé et le filtre animation-first avec exigence de provenance et de frames d'impact. (Aucun clip réellement intégré.)
- [ ] Lier chaque clip aux IDs réels des attaques ; intégrer les transitions,
  boucles et l'arrêt à la frame prévue.
- [ ] Contrôler synchronisation startup/active/recovery, contact, garde et
  réactions : les collisions restent dans la simulation et non dans les meshes.
- [ ] Mesurer en Ultra et Low : qualité des peaux et matériaux, déformations,
  charge CPU des bones, mémoire GPU et fps.
- [ ] Soumettre les premiers affrontements IA contre IA à la validation de Léon.

**Règle importante :** si la licence du fichier brute interdit sa republication,
ne pas déposer le FBX/GLB source dans ce repo public. Documenter une stratégie
de livraison du jeu conforme avant toute distribution.
