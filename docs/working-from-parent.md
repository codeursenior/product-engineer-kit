# Working inside another repository

This kit can be cloned inside another repository while remaining completely independent. The enclosing repository must ignore the `product-engineer-kit/` directory instead of tracking it as a Git submodule.

In the original local workspace, the repository lives at `product-engineer-kit/`. That folder contains the entire kit; the visualizer package lives at `product-engineer-kit/packages/agent-visualizer/`.

## Edit and publish the kit

From the parent repository:

```bash
cd product-engineer-kit
npm run check
git add packages/agent-visualizer
# Include any related root README, lockfile or workflow changes explicitly.
git commit -m "fix: describe the change"
git push origin main
```

This commit versions the tool directly in its public repository. The enclosing repository does not record the kit's revision. Publishing npm remains a separate step, documented in [releasing.md](releasing.md).

## Clone or restore the kit

First, ensure the enclosing repository ignores the directory from its root `.gitignore`:

```gitignore
/product-engineer-kit/
```

Then clone the kit at that path:

```bash
cd /path/to/enclosing-repository
git clone https://github.com/codeursenior/product-engineer-kit.git product-engineer-kit
```

The kit stays on its own `main` branch and uses its own public remote. The enclosing repository neither tracks its files nor reports its changes.

Before editing, verify that the kit is clean and up to date:

```bash
cd product-engineer-kit
git pull --ff-only origin main
```

A public clone of the kit on its own has no dependency on the parent repository. Never commit a parent workspace's private assets into this public repository.
