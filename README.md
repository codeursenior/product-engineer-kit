# Le kit du Product Engineer

**Des outils et des skills pour comprendre ton code et mieux travailler avec tes agents IA.**

Les instructions, les skills et la configuration de tes agents se dispersent dans ton projet et sur ta machine. Ce kit rassemble des utilitaires pour y voir plus clair, avec une commande de démarrage et une documentation par outil.

## Lancer un outil

### Agent Visualizer

Explore les fichiers de contexte de ton projet sous forme de graphe. Retrouve tes skills et tes serveurs MCP, et distingue les ressources du projet de celles de ton compte utilisateur.

```bash
npx @codeursenior/boyscout ui
```

Lance cette commande dans le dossier à explorer. Ton navigateur ouvre un tableau de bord local. Node.js 20 ou plus récent est nécessaire.

- Graphe des instructions et de leurs références, avec aperçu des fichiers.
- Inventaire des skills et de leur découverte par Cursor, Claude Code et Codex.
- Inventaire des configurations MCP. Les connexions actives ne sont pas vérifiées.
- Lecture seule, sans télémétrie ni envoi du contenu de tes fichiers.

[Documentation et limites d’Agent Visualizer](packages/agent-visualizer/README.md)

## Installer un skill

Aucun skill distribué pour le moment. Cette section accueillera les premiers skills avec leurs instructions d’installation.

## Explorer la suite

Retrouve les explications et les démonstrations sur la chaîne [CodeurSenior](https://www.youtube.com/@CodeurSenior).

## Contribuer

Chaque utilitaire possède son dossier dans `packages/`, sa version et sa publication npm. Le dépôt utilise les workspaces npm ; installer un outil ne nécessite pas d’installer les autres.

```bash
npm ci
npm run check
npm start -- /chemin/du/projet
```

- [Architecture d’Agent Visualizer](packages/agent-visualizer/docs/architecture.md)
- [Publication des packages](docs/releasing.md)
- [Travail depuis un espace Git parent](docs/working-from-parent.md)

MIT © Simon Dieny. Projet indépendant, sans affiliation avec OpenAI, Anthropic ou Cursor.
