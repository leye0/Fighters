# Mesures GitHub Actions — refactorisation Fighters

Relevé du 6 novembre 2026, directement à partir des durées affichées dans
l'historique du workflow [`browser-qa.yml`](https://github.com/leye0/Fighters/actions/workflows/browser-qa.yml).
Les trois scénarios WebGL (`visual`, `economy`, `combat`) passent en parallèle,
après un seul job de préparation des assets. Les valeurs sont donc des
**durées écoulées d'un workflow complet**, et non la somme des minutes des jobs.

| Période | Run | Durée affichée | Résultat |
|---|---|---:|---|
| Début du refactoring | [369](https://github.com/leye0/Fighters/actions/workflows/browser-qa.yml) | 4 min 22 s | Réussi |
| Début du refactoring | [370](https://github.com/leye0/Fighters/actions/workflows/browser-qa.yml) | 4 min 9 s | Réussi |
| Début du refactoring | [371](https://github.com/leye0/Fighters/actions/workflows/browser-qa.yml) | 3 min 25 s | Réussi |
| Après extraction des unités et des assets | [392](https://github.com/leye0/Fighters/actions/runs/42277316420) | 3 min 2 s | Réussi |
| Après test de relance Chrome | [393](https://github.com/leye0/Fighters/actions/runs/42278421711) | 2 min 47 s | Réussi |
| Après extraction des observations IA | [394](https://github.com/leye0/Fighters/actions/runs/42280385272) | 3 min 59 s | Réussi |

**Comparaison sur trois runs**, à titre indicatif :

- Durée médiane : **4 min 9 s → 3 min 2 s**, soit 67 secondes de moins (~27 %).
- Durée moyenne : **3 min 59 s → 3 min 16 s**, soit ~43 secondes de moins (~18 %).
- La dispersion reste élevée (de 2 min 47 s à 3 min 59 s sur les trois
  derniers runs). Les scénarios ont aussi évolué pendant la refactorisation :
  **ceci n'est pas un benchmark strictement comparable ni une garantie de gain**.

## Coût

Le dépôt `leye0/Fighters` est public et les workflows QA emploient des
**runners Ubuntu standard hébergés par GitHub**. Selon la
[documentation officielle de GitHub Actions](https://docs.github.com/en/actions/concepts/billing-and-usage),
les minutes de calcul de ces runners **ne sont pas facturées** dans les dépôts
publics. Pour ces exécutions, le coût de *calcul GitHub Actions* est donc
**0 USD**, même si le temps passé par le navigateur est bien réel.

Cette conclusion ne vaut pas pour les runners plus grands, le stockage
d'artefacts/cache au-delà des limites de forfait, ni pour les services externes
de génération (Replicate, par exemple). Elle ne représente pas une consultation
de la facture personnelle du propriétaire du dépôt.

## Ce qui a été optimisé

- Le build GLB complet a été remplacé, en QA et sur Pages ordinaires, par la
  restauration d'une archive d'assets versionnée et vérifiée (SHA-256).
- La préparation ne se produit qu'une seule fois par run, et les trois jobs
  Chrome consomment le même artifact éphémère.
- L'installation de compilateur TypeScript et la relance de Chrome avec échec
  volontaire ont leurs propres workflows déclenchés au besoin.
- La génération/installation npm du build d'assets est réservée à la
  reconstruction manuelle et au workflow de verrouillage des dépendances.

Pour de nouvelles comparaisons, garder des runs tous verts sur `main`, comparer
plusieurs exécutions de même contenu et relever séparément la durée de chaque
job ainsi que l'utilisation de stockage. Les métriques de facturation exactes
du compte GitHub restent accessibles uniquement au propriétaire du compte.
