# Working from a parent repository

This kit can live inside another repository as a Git submodule. Its code, history and public remote remain independent. The parent records the exact kit commit it uses.

In the original local workspace, the submodule path is `agent-visualizer/`. That folder contains the entire kit; the visualizer package lives at `agent-visualizer/packages/agent-visualizer/`.

## Edit and publish the kit

From the parent repository:

```bash
cd agent-visualizer
npm run check
git add packages/agent-visualizer
# Include any related root README, lockfile or workflow changes explicitly.
git commit -m "fix: describe the change"
git push origin main
cd ..
git add agent-visualizer
git commit -m "chore: update product engineer kit"
```

The first commit versions the tool. The second records its new revision in the parent. Publishing npm remains a separate step, documented in [releasing.md](releasing.md).

## Clone or restore the parent

```bash
git clone --recurse-submodules <parent-repository-url>
```

For an existing clone:

```bash
git submodule update --init --recursive
```

Git checks out the recorded commit in detached HEAD mode when initializing a submodule. Before editing, enter the kit, ensure the working tree is clean and switch to its existing `main` branch:

```bash
cd agent-visualizer
git switch main
git pull --ff-only origin main
```

A public clone of the kit on its own has no dependency on the parent repository. Never commit a parent workspace's private assets into this public repository.
