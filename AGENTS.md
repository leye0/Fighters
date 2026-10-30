# AGENTS.md — Fighters

Ce document s'applique à toute intervention dans le dépôt **Fighters**.

## Mandat

Construire un jeu de combat **2,5D photoréaliste pour le navigateur** : simulation de combat déterministe, personnages et environnements 3D réalistes, contrôles arcade, coups spéciaux, HUD, audio et modes de jeu de niveau production.

Le document directeur est **docs/production-plan.md**. Le consulter avant toute modification, mettre à jour les cases réalisées dans le même commit que le travail associé et ne jamais marquer une case terminée sans preuve concrète.

## Méthode demandée par le propriétaire

1. **Toujours travailler directement dans main.** Ne pas créer de branche de fonctionnalité ou de pull request. Ne pas forcer les pushes et ne pas réécrire l'historique.
2. **Production dès le départ.** Aucun MVP, prototype jetable ou faux mécanisme présenté comme complet. Les étapes de réalisation peuvent être ordonnées par dépendances mais n'annulent aucune exigence du plan.
3. **Qualité mesurable.** Définir le comportement attendu, implémenter, tester, vérifier les régressions pertinentes, puis committer sur main.
4. **Architecture extensible et animation-first.** Combattants, coups, animations, arènes, sons et effets sont pilotés par des données. **Les coups du vrai jeu doivent provenir de clips réellement disponibles, inspectés et retargetés**, puis leurs commandes et combos sont choisis. Le `MOVE_CATALOG` de 71 idées n'est qu'une fixture du moteur et ne doit jamais servir d'arsenal de production. Voir `docs/animation-first.md`.
5. **Ne pas inventer de validation visuelle.** Lorsque la perception humaine du rendu ou du gameplay est nécessaire, fournir une version testable et demander au propriétaire de juger ; ne pas créer un processus « Lab » autonome qui s'arrogerait cette validation.
6. **Respecter les changements existants.** Vérifier l'état et les instructions du dépôt avant d'éditer. Ne pas supprimer de travail sans ordre explicite.
7. **Ne pas multiplier inutilement les actions CI payantes.** Privilégier validations locales adaptées, workflows ciblés, cache et annulation des exécutions périmées.
8. **Double objectif indissociable : puissance et photoréalisme.** Ne jamais considérer une belle image figée comme une preuve de jeu performant ; ne pas dégrader silencieusement le rendu haut de gamme pour atteindre une cible FPS. Mesurer CPU/GPU, cadence et qualité visuelle ensemble.
9. **Captures Web : réutiliser WebSuite de WarConquer.** La version générique est dans [WarConquer/scripts/websuite.mjs](https://github.com/leye0/WarConquer/blob/main/scripts/websuite.mjs). Pour Fighters, l'adapter au serveur Vite, à l'initialisation du canvas WebGL et aux profils GPU. Voir [docs/visual-qa.md](docs/visual-qa.md). Ne pas importer le workflow WarConquer tel quel, ses PR, ses scènes de démonstration ou son Perception Lab.

## Architecture cible

- TypeScript/Vite, Three.js avec WebGL 2 ; WebGPU seulement derrière un adaptateur et après évaluation.
- Simulation autoritative à **60 ticks/s** séparée du rendu et de l'animation.
- Affichage 3D avec caméra latérale, déplacement déterministe sur un plan de combat.
- Les hitboxes, hurtboxes, timings, états et dégâts proviennent des données de simulation ; le squelette visuel ne décide jamais du résultat d'un coup.
- Replays reproductibles, tests de règles, données de frame, tests navigateur et mesure de performance.
- Priorité simultanée au **rendu photoréaliste maximal** et à la **fluidité/puissance mesurée**. Les profils dégradés restent explicites ; la référence de qualité Ultra ne doit pas être abaissée tacitement.

## QA de gameplay IA contre IA

- Le banc `npm run simulate:ai` évalue des combats à 60 ticks/s avec les mêmes `InputFrame` que les joueurs. Les tests doivent vérifier la reproductibilité, la présence d'échanges, les attaques spéciales et les avertissements d'inactivité.
- **Ne jamais déduire qu'un combat est « fun » à partir de simples statistiques.** Après intégration de deux combattants photoréalistes et d'animations, exécuter un véritable match IA contre IA dans WebGL, l'enregistrer avec WebSuite et demander au propriétaire une appréciation à vitesse réelle. Voir `docs/ai-combat-qa.md`.
- La simple existence d'un emplacement d'animation dans le catalogue ne signifie pas qu'un clip Mixamo a été acquis ni que sa licence a été vérifiée.
- **Aucun coup visuellement exécutable sans son vrai clip approuvé pour le personnage** : l'inventaire `assets/animation-inventory.json` doit être exploité pour créer ses moves, et la présence des clips exacts dans le GLB est obligatoire avant de lancer le match.

## Sources Mixamo WarConquer (réel, pas théorique)

- Consulter [docs/mixamo-real-sources.md](docs/mixamo-real-sources.md) et [assets/mixamo-available-clips.json](assets/mixamo-available-clips.json) : 471 candidats triés sur noms et descriptions dans les index réels, 11117 FBX binaires téléchargés/hachés en privé.
- Le script `scripts/acquire-mixamo.py` acquiert les sources dans une destination **hors repo Git public**. Ne pas committer les FBX bruts ni les GLB de clips isolés à droits incertains.
- Ces clips **ne sont pas validés pour le jeu** : `assets/animation-inventory.json` reste vide. Seuls des clips légalement vérifiés, retargetés, visionnés et avec frames de contact mesurées autorisent un coup jouable.
- Ne pas dépendre d'un transfert de navigateur Adobe fragile pour les essais techniques. Préserver la provenance Adobe; le miroir tiers ne crée aucune autorisation nouvelle.

## Statut du projet

Fighters est **non commercial pour le moment**, selon le propriétaire. Ce statut ne donne pas le droit de republier des animations ou modèles tiers dans un dépôt public sans respecter leur licence. Préserver la possibilité de réévaluer les droits si la diffusion change.

## Ressources tierces

- Dépôt **public** : **ne jamais committer** un modèle, une animation, un son ou une texture dont la redistribution publique n'est pas expressément compatible avec sa licence.
- Mixamo autorise son utilisation dans des jeux ; cela ne suffit pas à établir le droit de republier ses sources brutes dans Git.
- Privilégier CC0. CC BY est envisageable avec crédits corrects et conditions vérifiées. Les licences NC et les droits incertains ne doivent pas entrer dans le produit commercialisable.
- Pour tout asset : URL source, auteur, licence, obligations, date, formats, hash et statut de validation dans le registre.
- Respecter droits à l'image, marques et personnages protégés. Fighters doit posséder une identité visuelle originale.
- Ne jamais affirmer qu'une licence est validée sans l'avoir vérifiée pour **l'asset précis**.

## Définition de terminé

Une tâche est terminée seulement lorsqu'elle a :
- un résultat fonctionnel concret ;
- les tests et contrôles pertinents exécutés avec résultat connu ;
- une qualité/performance proportionnée à l'usage ;
- ses données et droits documentés le cas échéant ;
- le plan mis à jour.

Rapporter honnêtement ce qui reste à faire et tout blocage. Ne jamais présenter une coquille vide comme un jeu jouable.
