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

Pour utiliser la dernière version depuis un autre dépôt ou un autre PC, ouvre un terminal dans ce dépôt et vérifie la version avant de lancer l'interface :

```bash
npx --yes --prefer-online @codeursenior/boyscout@latest --version
npx --yes --prefer-online @codeursenior/boyscout@latest ui
```

`npx` installe l'outil si nécessaire, sans installation globale. `@latest` cible la dernière version publiée sur npm et `--prefer-online` demande à npm de vérifier le registre même si une version est en cache. Cette commande fonctionne quel que soit l'agent utilisé dans le dépôt.

- Graphe des instructions et de leurs références, avec aperçu des fichiers.
- Inventaire des skills et de leur découverte par Cursor, Claude Code et Codex.
- Inventaire des configurations MCP. Les connexions actives ne sont pas vérifiées.
- Lecture seule, sans télémétrie ni envoi du contenu de tes fichiers.

[Documentation et limites d’Agent Visualizer](packages/agent-visualizer/README.md)

## Installer un skill

### PEK Grill Me

Clarifie une idée dans un chat web local, en gardant l’agent et le contexte de ta session Codex. Une question à la fois, avec une recommandation. Fermer ne crée aucun document.

```bash
npx skills add codeursenior/product-engineer-kit --skill pek-grill-me -g -a codex
```

Installe le skill pour toutes tes sessions Codex. Node.js 20 ou plus récent est nécessaire. Lance ensuite `$pek-grill-me` avec ton sujet dans Codex.

[Voir PEK Grill Me sur skills.sh](https://skills.sh/codeursenior/product-engineer-kit/pek-grill-me) · [Installation et limites](skills/pek-grill-me/README.md)

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
- [Source de vérité et miroir public](docs/working-from-parent.md)

MIT © Simon Dieny. Projet indépendant, sans affiliation avec OpenAI, Anthropic ou Cursor.
