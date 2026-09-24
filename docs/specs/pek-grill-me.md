# pek-grill-me : entretien dans un chat web local

Date : 2026-09-24

Périmètre produit validé. Stratégie de test proposée, à confirmer avant publication avec le label `ready-for-agent`.

## Problem Statement

Un développeur utilise son agent pour clarifier une idée, un plan ou une décision par un entretien approfondi. Il veut mener cet échange dans une page web, avec le confort d'un chat, tout en conservant l'agent et le contexte de sa session de départ.

Il ne veut ni configurer une deuxième IA, ni copier ses réponses entre le navigateur et le terminal, ni installer les skills personnels de l'auteur. Il souhaite décider lui-même, après l'entretien, s'il faut produire une spécification, un handoff ou un autre livrable.

## Solution

Distribuer `pek-grill-me` dans le Product Engineer Kit. Le développeur invoque le skill dans une session Codex avec son sujet. Le skill lance une interface locale et l'ouvre automatiquement dans le navigateur habituel.

L'agent Codex d'origine mène l'entretien. La page affiche ses messages et transmet les réponses de l'utilisateur à cet agent. Le comportement reprend celui de `grill-me` : une question à la fois, une réponse recommandée, puis une relance adaptée à la réponse reçue. L'agent vérifie les faits accessibles dans son environnement plutôt que de demander à l'utilisateur de les retrouver.

L'interface comprend l'historique de l'entretien, un champ de saisie et une commande « Fermer ». Cette commande termine la session web sans générer de document. L'échange reste exploitable dans le contexte Codex d'origine pour que l'utilisateur puisse invoquer séparément le skill de son choix.

## User Stories

1. En tant qu'utilisateur du Product Engineer Kit, je veux installer un skill autonome, afin de l'utiliser sans dépendre du dépôt de travail privé de son auteur.
2. En tant qu'utilisateur de Codex, je veux invoquer `pek-grill-me` dans ma session actuelle, afin de conserver mon agent et son contexte.
3. En tant qu'utilisateur, je veux donner le sujet de l'entretien à Codex au lancement, afin que la première question porte sur mon idée.
4. En tant qu'utilisateur, je veux que le navigateur habituel s'ouvre automatiquement, afin de commencer sans lancer manuellement un serveur.
5. En tant qu'utilisateur, je veux que la page soit servie sur ma machine, afin de ne pas créer de compte pour une nouvelle application web.
6. En tant qu'utilisateur, je veux employer l'IA déjà utilisée par Codex, afin de ne pas configurer de clé API supplémentaire.
7. En tant qu'utilisateur, je veux lire les questions de l'agent dans la page, afin d'y mener tout l'entretien.
8. En tant qu'utilisateur, je veux répondre par texte libre, y compris sur plusieurs lignes, afin de pouvoir expliquer mes choix.
9. En tant qu'utilisateur, je veux que mes réponses parviennent à l'agent automatiquement, afin d'éviter le copier-coller vers le terminal.
10. En tant qu'utilisateur, je veux recevoir une seule question à la fois, afin de résoudre les décisions dans l'ordre.
11. En tant qu'utilisateur, je veux une réponse recommandée avec chaque question, afin de comprendre ce que l'agent conseille et pourquoi.
12. En tant qu'utilisateur, je veux que la question suivante tienne compte de ma réponse, afin de mener un entretien adaptatif.
13. En tant qu'utilisateur, je veux que l'agent explore les faits disponibles dans mon projet, afin de consacrer mes réponses aux décisions qui me reviennent.
14. En tant qu'utilisateur, je veux relire les messages de l'entretien dans leur ordre, afin de suivre les décisions déjà prises.
15. En tant qu'utilisateur, je veux distinguer une réponse en cours de traitement d'un échec de communication, afin de savoir si je dois attendre ou revenir à Codex.
16. En tant qu'utilisateur, je veux qu'un envoi ne soit pas pris en compte deux fois, afin de ne pas provoquer plusieurs relances pour la même réponse.
17. En tant qu'utilisateur, je veux terminer l'entretien avec « Fermer », afin de revenir à ma session Codex.
18. En tant qu'utilisateur, je veux que fermer l'entretien ne produise aucun livrable, afin de choisir moi-même la suite.
19. En tant qu'utilisateur, je veux que Codex conserve les réponses déjà acceptées, afin de pouvoir lui demander ensuite une spec ou un handoff.
20. En tant qu'utilisateur, je veux que l'entretien clarifie mon projet sans lancer sa réalisation, afin de garder la décision de passer à l'action.
21. En tant qu'utilisateur, je veux un message utile si le lancement échoue, afin de comprendre comment reprendre depuis Codex.
22. En tant qu'utilisateur, je veux que l'interface soit utilisable au clavier et que son contenu reste lisible, afin de répondre aussi simplement que dans un chat.

## Implementation Decisions

### Décisions validées

- Le produit est un skill du Product Engineer Kit, nommé `pek-grill-me`.
- La V1 cible Codex. La compatibilité avec d'autres agents n'est pas requise.
- L'agent de la session de départ reste responsable du raisonnement et du dialogue. Aucune seconde session d'IA ne remplace cet agent.
- Le skill ouvre un chat dans le navigateur habituel. Le navigateur intégré à l'application Codex n'est pas une dépendance.
- L'interface web et son service de communication tournent localement. Le modèle reste celui utilisé par Codex ; cela ne constitue pas une promesse d'IA hors ligne.
- Le contenu de l'entretien est exclusivement textuel pour la V1. Les visuels explicatifs, formulaires spécialisés et composants de décision ne font pas partie de cette version.
- La logique d'entretien est incluse dans le skill distribué. Elle ne dépend pas de l'installation des skills personnels `grill-me` ou `grilling`.
- Une question est posée à la fois, accompagnée d'une recommandation. L'agent attend la réponse avant de poursuivre et explore les dépendances entre les décisions.
- Le skill ne réalise pas le projet discuté. Il s'arrête à l'entretien.
- La seule action de fin d'entretien est « Fermer ». Les moyens ordinaires de saisir et d'envoyer un message restent présents.
- Il n'existe aucun bouton To Spec, Handoff, Exporter ou Générer. Aucun de ces skills n'est appelé automatiquement.
- Les messages de l'entretien doivent rester exploitables dans la session Codex d'origine. Une page qui conserve seule les réponses ne satisfait pas cette exigence.

### Architecture minimale proposée

- Trois responsabilités suffisent : les instructions du skill, un relais local entre l'agent et le navigateur, et l'interface de chat.
- Le relais expose à l'agent des opérations pour démarrer une session, transmettre un message, recevoir une réponse ou un événement de fermeture, puis arrêter la session.
- Les messages sont ordonnés et rattachés à une session. Une réponse acceptée est remise une seule fois à l'agent. L'interface indique explicitement les échecs d'envoi.
- Le navigateur affiche les messages et transmet la saisie. Il n'appelle aucun fournisseur de modèle et n'exécute pas de commandes arbitraires issues des messages.
- Le relais écoute uniquement sur l'interface locale et protège les échanges contre les requêtes provenant d'autres sites. Le contenu du chat est traité comme du texte, pas comme du code exécutable.
- Le kit utilise déjà Node.js 20 ou supérieur, des packages npm autonomes et un serveur HTTP local. Réutiliser ces conventions lorsque cela simplifie le lancement, sans coupler le skill au scanner d'Agent Visualizer.
- La fermeture doit notifier l'agent, débloquer son attente et arrêter les ressources propres à la session. Si la fermeture automatique de l'onglet n'est pas possible, la page affiche un état terminé et indique que l'onglet peut être fermé.
- Le mécanisme concret qui permet à Codex de publier une question et d'attendre une réponse reste à vérifier par un essai réel avant de développer toute l'interface. Il doit respecter les permissions de la session et ne pas dépendre d'un accès privé à l'application desktop.
- Les opérations de lancement, de transmission et d'arrêt sont des contrats de comportement proposés. Le transport, les noms des commandes et leur format exact relèvent de la réalisation.

## Testing Decisions

### Point de test principal proposé

Tester le cycle de vie public d'une session de chat, en utilisant le vrai relais local et un adaptateur d'agent déterministe. Vérifier les comportements observables depuis ses deux extrémités : navigateur et agent. Éviter de tester séparément chaque détail interne ou d'imposer un découpage de modules pour les seuls besoins des tests.

Le parcours principal doit démontrer que :

1. Une session démarre et fournit une page locale accessible.
2. Une question publiée par l'agent apparaît dans l'historique.
3. Une réponse envoyée depuis le navigateur est remise une seule fois à l'agent, avec son texte intact.
4. Une deuxième question peut être publiée et l'historique conserve l'ordre complet.
5. « Fermer » est reçu même lorsque l'agent attend une réponse.
6. Les échanges acceptés restent accessibles côté agent après la fermeture.
7. Le service de la session s'arrête sans appeler de génération de document.

Le même point d'entrée permet de vérifier les envois répétés, l'arrêt pendant une attente, les erreurs de transport et le rejet des requêtes non autorisées. Les tests vérifient le résultat observable, sans figer les fonctions privées ni le protocole choisi.

### Vérification indispensable avec Codex

Un adaptateur simulé ne prouve pas l'intégration avec l'agent réel. Avant de considérer la fonctionnalité terminée, effectuer un essai dans une vraie session Codex : invoquer le skill, répondre à deux questions dans le navigateur, fermer, puis demander à Codex de reformuler les décisions prises. La reformulation doit s'appuyer sur les réponses effectivement reçues dans cette même session.

Cet essai valide aussi l'ouverture du navigateur habituel, le maintien de l'attente entre deux réponses et le retour à Codex. La qualité adaptative de l'entretien se vérifie pendant cet essai ; elle ne se réduit pas à une égalité de chaînes dans un test automatisé.

### Précédent dans le kit

Agent Visualizer possède des tests d'intégration avec le lanceur de tests natif de Node.js : ils démarrent un vrai serveur, interrogent son interface HTTP et vérifient la page servie, les contrôles d'accès et le nettoyage. Reprendre cette approche pour le relais de chat. Ajouter une vérification du rendu et de la saisie dans le navigateur pour les comportements que les seuls tests HTTP ne couvrent pas.

### Modules couverts

- Relais et cycle de vie de session : tests d'intégration automatisés au niveau du contrat public.
- Interface de chat : vérification de l'historique, de la saisie, des états d'attente et de la fermeture dans le navigateur.
- Skill et intégration Codex : essai réel du parcours complet, y compris la disponibilité des réponses après fermeture.
- Distribution : vérifier que l'installation et le lancement fonctionnent sans ressources privées ni autres skills préinstallés.

## Out of Scope

- Compatibilité Claude Code, Cursor ou autres agents pour la V1.
- Application autonome dotée de son propre modèle ou de sa propre clé API.
- Hébergement distant, comptes, collaboration entre plusieurs personnes et accès réseau partagé.
- Schémas, visualisations, annotations et formulaires spécialisés.
- Génération ou export automatique de Markdown, spec, handoff, tickets ou compte rendu.
- Publication, commit ou implémentation automatique du projet discuté dans l'entretien.
- Réouverture persistante d'un entretien après arrêt de Codex, bibliothèque de sessions ou synchronisation entre machines.
- Promesse de conservation illimitée de l'historique au-delà des capacités ordinaires de contexte de Codex.
- Implémentation d'une interface de chat généraliste qui expose toutes les fonctions de Codex.

## Further Notes

- PEK signifie Product Engineer Kit.
- Le produit livré par cette fonctionnalité est le skill et son interface, pas le projet discuté par l'utilisateur pendant un entretien.
- La décision initiale d'un handoff automatique a été remplacée pendant le cadrage : la fermeture ne génère rien. Cette spécification retient uniquement le périmètre final.
- L'absence d'export concerne le comportement du produit. Elle n'interdit pas les données temporaires nécessaires à son fonctionnement, à condition de ne pas en faire un livrable implicite ni une dépendance pour l'exploitation de l'échange dans Codex.
- Les conditions détaillées de distribution, le support des systèmes d'exploitation et le traitement d'un onglet fermé brutalement devront être documentés selon ce qui aura été effectivement vérifié. Ils ne doivent pas élargir la V1 à un gestionnaire de sessions persistantes.
- Ce document définit les exigences initiales. Les vérifications réalisées pendant l'implémentation figurent ci-dessous.

## Vérification de l'implémentation du 2026-09-24

- Tests d'intégration du relais : cycle complet, fermeture pendant l'attente, contrôle d'accès, envois répétés et requêtes simultanées.
- Essai dans cette session Codex avec un vrai navigateur : deux questions publiées par l'agent, deux réponses saisies dans la page, dont une sur plusieurs lignes, fermeture reçue et historique relu côté agent. Le navigateur par défaut de macOS s'est ouvert automatiquement lors d'un second lancement.
- La découverte du skill après copie dans une nouvelle session Codex n'a pas été vérifiée. Ce dernier essai reste nécessaire avant publication avec le label `ready-for-agent`.
