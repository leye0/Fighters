# Fighters — découverte Mixamo et arsenal dicté par les animations

**Statut actuel : 471 clips Mixamo réels identifiés, 117 fichiers FBX binaires téléchargés et vérifiés en privé, aucun clip intégré ou approuvé pour le jeu.**
Le moteur sait charger une scène GLB et des clips d'animation, mais il n'a
pas encore les animations de combat ni un retargeting fonctionnel par personnage.

La [FAQ Adobe](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html)
permet l'usage de personnages/animations Mixamo dans les jeux vidéo, y compris
commerciaux, et annonce un accès gratuit avec Adobe ID. Cela **n'autorise pas
automatiquement la republication des fichiers sources bruts** dans un dépôt
GitHub public. Vérifier les conditions applicables lors de l'acquisition.

Le [catalogue des 70 pistes de recherche](../assets/mixamo-catalog.json) ne donne que des mots-clés `search_pending`, mais le [nouvel index de 471 animations réelles](../assets/mixamo-available-clips.json) apporte les vrais noms, IDs et nombres de frames, avec [sources et acquisition reproductible](mixamo-real-sources.md). **Les coups seront choisis en regardant les vrais gestes retargetés, jamais à partir des seuls titres.** Une fois chaque animation trouvée, nous déterminons ce qu'elle montre réellement, ses points de contact, ses variantes et ses possibles enchaînements, selon [le protocole animation-first](animation-first.md). Les clips approuvés vont dans [l'inventaire de production](../assets/animation-inventory.json).

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

- [x] Retrouver les fichiers réels de Mixamo par le miroir documenté dans WarConquer et les indexer (471 clips, dont 11117 FBX binaires vérifiés).
- [x] Fournir un téléchargeur privé et reproductible sans dépendance ni pop-up Adobe.
- [ ] Confirmer auprès d'Adobe les droits applicables au mode de distribution visé, et vérifier le contenu des fichiers avant leur inclusion.
- [ ] Explorer Mixamo officiel si nécessaire pour variantes de rig, vitesses et validation complémentaire.
- [x] Créer le premier registre sourcé par clip (index, nom, ID, FPS, frames, statut légal, SHA-256 pour 7 binaires vérifiés).
- [ ] Compléter les droits de redistribution, l'inspection visuelle, les rig targets et les empreintes des clips retenus pour le produit.
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
