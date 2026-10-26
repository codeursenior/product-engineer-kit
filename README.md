# Le kit du Product Engineer

**Des outils et des skills pour comprendre ton code et mieux travailler avec tes agents IA.**

Les instructions, les skills et la configuration de tes agents se dispersent dans ton projet et sur ta machine. Ce kit rassemble des utilitaires pour y voir plus clair, avec deux points d’entrée : lancer Agent Visualizer pour explorer un projet, ou installer un skill pour guider ton agent.

## Lancer Agent Visualizer

Explore les fichiers de contexte de ton projet sous forme de graphe. Retrouve tes skills et distingue les ressources du projet de celles de ton compte utilisateur.

```bash
npx @codeursenior/pek audit agent
```

Cet audit inventorie la configuration locale des agents et propose des estimations de contexte. Il ne donne pas de score de qualité et ne prouve pas ce qu’un agent a chargé en session.

Lance cette commande dans le dossier à explorer. Ton navigateur ouvre un tableau de bord local. Node.js 20 ou plus récent est nécessaire.

Pour utiliser la dernière version depuis un autre dépôt ou un autre PC, ouvre un terminal dans ce dépôt et vérifie la version avant de lancer l'interface :

```bash
npx --yes --prefer-online @codeursenior/pek@latest --version
npx --yes --prefer-online @codeursenior/pek@latest audit agent
```

`npx` installe l'outil si nécessaire, sans installation globale. `@latest` cible la dernière version publiée sur npm et `--prefer-online` demande à npm de vérifier le registre même si une version est en cache. Cette commande fonctionne quel que soit l'agent utilisé dans le dépôt.

- Graphe des instructions et de leurs références, avec aperçu des fichiers.
- Inventaire des skills et de leur découverte par Cursor, Claude Code et Codex.
- Lecture seule, sans télémétrie ni envoi du contenu de tes fichiers.

[Documentation et limites d’Agent Visualizer](packages/agent-visualizer/README.md)

## Installer des skills

Les skills sont des instructions installées depuis GitHub avec le [CLI skills](https://github.com/vercel-labs/skills). Ils se découvrent aussi sur [skills.sh](https://skills.sh). Leur installation est indépendante de la commande npm d’Agent Visualizer.

### PEK Ingest

Une décision utile se perd dans une discussion ? Demande à l’agent de la ranger dans le contexte du projet. Il cherche d’abord une note existante, conserve les sources et ajoute les liens qui permettront de retrouver l’information.

```bash
npx skills add codeursenior/product-engineer-kit --skill pek-ingest -g -a codex
```

Lance ensuite `$pek-ingest` avec le document ou les décisions à conserver. Les conventions Obsidian sont prises en compte sans autre skill à installer.

[Installation, invocation et limites](skills/pek-ingest/README.md)

### PEK Root Cause

Quand un bug revient après une correction, fais retracer la chaîne qui le rend possible. Le skill distingue les preuves des hypothèses, puis propose un plan de correction avec sa vérification. Si la cause reste inconnue, il indique la prochaine étape de diagnostic.

```bash
npx skills add codeursenior/product-engineer-kit --skill pek-root-cause -g -a codex
```

Lance explicitement `$pek-root-cause` avec le problème dans Codex. Le diagnostic est embarqué ; l’analyse ne lance pas la correction sans demande de ta part.

[Installation, invocation et limites](skills/pek-root-cause/README.md)

### PEK Grill Me

Clarifie une idée dans un chat web local, en gardant l’agent et le contexte de ta session Codex. Une question à la fois, avec une recommandation. Fermer ne crée aucun document.

```bash
npx skills add codeursenior/product-engineer-kit --skill pek-grill-me -g -a codex
```

Installe le skill pour toutes tes sessions Codex. Node.js 20 ou plus récent est nécessaire. Lance ensuite `$pek-grill-me` avec ton sujet dans Codex.

[Voir PEK Grill Me sur skills.sh](https://skills.sh/codeursenior/product-engineer-kit/pek-grill-me) · [Installation et limites](skills/pek-grill-me/README.md)

### PEK Auto Improve

À la fin d’une session, retrouve les corrections et les blocages qui méritent d’être conservés dans tes skills ou le contexte de ton projet. Le skill propose des modifications précises et attend ta validation avant de les appliquer. Tu choisis ce que ton agent doit retenir pour les prochaines sessions.

```bash
npx skills add codeursenior/product-engineer-kit --skill pek-auto-improve -g -a codex
```

Lance ensuite `$pek-auto-improve` dans Codex. Le skill utilise la conversation et les fichiers accessibles à ton agent, sans dépendance aux autres outils du kit.

[Voir PEK Auto Improve sur skills.sh](https://skills.sh/codeursenior/product-engineer-kit/pek-auto-improve) · [Installation et limites](skills/pek-auto-improve/README.md)

Les commandes ci-dessus installent les skills pour ton compte Codex. Retire `-g` pour une installation limitée au projet. Les fichiers deviennent disponibles après synchronisation du miroir GitHub ; leur référencement sur skills.sh peut suivre avec un délai.

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
