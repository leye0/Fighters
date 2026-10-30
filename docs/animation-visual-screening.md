# Examen des 60 animations Mixamo — 30 octobre 2026

**Statut : présélection visuelle, pas validation finale de gameplay.** Les 63 animations proviennent de fichiers FBX réellement acquis et convertis en GLB en recherche privée. L'examen consigné ici est fondé sur **quatre instants de la vue YBot `v000`**, plus **un instant dans chacun des quatre angles** des 63 prévisualisations MP4 hébergées par le dataset source. Ce n'est pas encore une lecture intégrale des animations. Aucun GLB retargeté sur un personnage de Fighters n'a encore été observé dans le moteur.

Le [rapport par animation](../assets/mixamo-screening.json) contient **36 gestes prometteurs, 25 à comparer et 2 à déprioriser**, sans aucune suppression définitive. Ce classement ne vaut **pas approbation de Léon**. Le [lecteur interactif](../animation-review.html) lui permet de vérifier lui-même les **quatre angles**, choisir « garder », « écarter » ou « à revoir », annoter et exporter la décision avec identifiants et empreintes de source.

## Observations concrètes

1. **Locomotion arrière : une lacune a été identifiée puis trois alternatives ajoutées.** `Medium_Step_Forward` et `Long_Step_Forward` sont de bonnes pistes pour l'avance en garde. `Ginga_Backward` recule dans un style capoeira, bras ouverts : mauvais remplacement générique d'une marche arrière en garde. Les véritables pas arrière de boxe `Step_Backward_2` (court), `_3` (moyen), et `Step_Backward` (long), absents des 299 conversions initiales, ont été acquis et convertis en 3 GLB privés valides (302 au total). Leurs quatre vues échantillonnées montrent la garde maintenue et des jambes actives : **tous trois prometteurs**, mais leurs distances/axes et leurs raccords restent à mesurer sur le rig.
2. **Sauts et profondeur.** Les prévisualisations `Backward_Jump` et `Forward_Jump` affichent des variations d'échelle fortes ; le déplacement semble contenir de la profondeur caméra. Il faudra mesurer les axes de root motion des vrais GLB et projeter les déplacements sur le plan 2,5D. Les vidéos seules ne prouvent pas les coordonnées d'animation.
3. **Des descriptions trompeuses lorsqu'on ne voit que le nom.** `Boxing_8` montre une flexion très profonde, correspondant à sa description « Body Punch To The Knee » ; l'employer comme simple punch debout serait inapproprié. `Leg_Sweep_2` n'expose pas clairement son contact sur quatre images ; le visionnage vidéo reste indispensable.
4. **Doublons apparents.** `Center_Block`, `Center_Block_2` et `Block` doivent être comparés en mouvement et sous plusieurs angles. Pareil pour `Head_Hit_4` / `Head_Hit_8` et `Lead_Jab_2` / `Lead_Jab_4`. Une variation de bras, d'impact ou de durée peut justifier de conserver les deux.
5. **Coups spectaculaires à traiter en corps entier.** `Armada`, `Bencao`, `Hurricane_Kick`, les coups de pied tournants, le genou et `Flying_Knee_Punch_Combo` sollicitent fortement les jambes, le bassin et le tronc. Il serait dangereux de les déclarer combinables sans test sur le rig. La superposition « locomotion bas du corps + frappe haut du corps » cible surtout les jabs, directs et certains crochets.
6. **Réactions et projections.** `Knocked_Down`, `Getting_Up` et `Knocked_Out` semblent remplir des rôles différents, mais leurs poses de raccord doivent coïncider. `Double_Leg_Takedown_-_Attacker` et `Double_Leg_Takedown_-_Victim` forment une paire : jamais deux attaques indépendantes.

## Ordre concret de validation

1. Visionner les quatre vidéos de chacune des 63 animations (252 prévisualisations obtenues ; le tri `v000` ne couvre pas encore la lecture vidéo complète), choisir et exporter la liste préférée.
2. Chercher des alternatives à la marche arrière et aux cas confus plutôt que de forcer la liste à 60.
3. Charger les **GLB privés réellement convertis** sur un rig de référence, établir les axes, le début/fin et les frames de contact.
4. Retargeter vers les combattants finaux puis tester les combinaisons **marche avant + jab**, **marche arrière + direct**, **saut + jab** et **saut + coup de pied** individuellement. Bloquer par défaut les couples non inspectés ; mesurer vitesse, pose et patinage des pieds.
5. Après jugement humain du rendu, inscrire les clips admissibles dans l'inventaire de production avec leur statut de droit/licence. Seulement alors créer les coups effectifs.

### Provenance et droits

- Index source : <https://huggingface.co/datasets/Linzhan/Mixamo-Animations-Characters/tree/main/animation_motion_render>
- Les MP4 restent sur le service source ou dans un dossier de recherche privé. **Aucun MP4, FBX ou GLB tiers dans Git.**
- La disponibilité d'une animation en aperçu ne prouve ni sa qualité sur un autre rig ni une permission de redistribution.
