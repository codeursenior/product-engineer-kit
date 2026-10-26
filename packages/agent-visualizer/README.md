# Agent Visualizer

**Explore your coding agents’ context, estimate its token footprint, and compare input costs across models.**

![Agent Visualizer homepage showing estimated startup and on-demand context with input costs.](https://raw.githubusercontent.com/codeursenior/product-engineer-kit/main/packages/agent-visualizer/assets/readme/homepage.png)

```bash
# Run from your project folder
npx @codeursenior/pek@latest audit agent
```

Requires Node.js 20+. Your browser opens automatically. Press `Ctrl+C` to stop.

- **Understand your context:** distinguish estimated startup content from content available on demand.
- **Compare input costs:** select a model to estimate the cost of loading that context.
- **Find the largest contributors:** see which files and skill descriptions account for the most startup tokens.
- **Explore your instructions:** navigate an interactive graph, preview files, and edit context directly.
- **Map your skills:** browse their descriptions and arrange them on a whiteboard to visualize your workflows.
- **Inspect MCP configuration:** see configured servers and which agents can discover them.
- **Switch perspectives:** filter by Codex, Claude Code, Cursor, or GitHub Copilot, and separate project configuration from user configuration.

_Token counts and costs are estimates based on discoverable context, rather than measurements of live session usage or spending._

## Easter Egg

<img src="https://raw.githubusercontent.com/codeursenior/product-engineer-kit/main/packages/agent-visualizer/assets/readme/agent-identity.png" alt="Before: the default sidebar. After: an astronaut portrait and the name Astronaut." width="380">

Give your agent its own identity in the sidebar:

1. **Name:** create `.agents/NAME.md` at your project root and write `Astronaut` on its first line.
2. **Avatar:** add your portrait as `.agents/AVATAR.png` or `.agents/AVATAR.jpeg` (maximum 2 MiB). You can use [this astronaut portrait](https://raw.githubusercontent.com/codeursenior/product-engineer-kit/main/packages/agent-visualizer/assets/readme/astronaut.jpeg).

Click **Rescan** to reveal your agent’s new look.
