# Releasing

Elrond is the source of truth for the Product Engineer Kit. The public `codeursenior/product-engineer-kit` repository is a read-only mirror of Elrond's `product-engineer-kit/` subtree. Each tool remains an independent npm workspace, and the kit root stays private to prevent accidentally publishing the entire repository.

Agent Visualizer lives in `packages/agent-visualizer`. Its npm package is `@codeursenior/boyscout`, with the `boyscout` executable.

## Validate and synchronize from Elrond

Run this after every push of a change under `product-engineer-kit/` to Elrond's `origin/main`, including a one-file change. Mirroring is part of completing that push and does not wait for a package release.

```bash
./scripts/sync-product-engineer-kit.sh
```

The script requires Elrond's committed `main` branch to match `origin/main`. It installs dependencies, runs the complete checks, previews the npm archive and pushes only the kit subtree to the public mirror. It never publishes npm, creates a tag or force-pushes.

Review the package file list. Only the selected tool's source, prebuilt browser assets, package metadata, documentation and licenses belong in the archive. Private test repositories and temporary credentials belong in ignored `.local/` directories and must never be committed or published.

Verify that the new commit is visible on the public `main` branch and wait for its GitHub Actions workflow to pass. A GitHub Release and tag are separate publication steps; when making a release, create them against the mirror's `main` branch and never push an Elrond tag to the public repository.

## Publish npm from the kit directory

From Elrond:

```bash
cd product-engineer-kit
```

Sign in with an npm account allowed to publish in the `@codeursenior` scope. Keep authentication files local to this checkout:

```bash
npm login --userconfig "$PWD/.local/npmrc" --cache "$PWD/.local/npm-cache"
npm whoami --userconfig "$PWD/.local/npmrc" --cache "$PWD/.local/npm-cache"
npm publish --workspace @codeursenior/boyscout --access public --userconfig "$PWD/.local/npmrc" --cache "$PWD/.local/npm-cache"
```

Complete any browser authentication or 2FA yourself. The scope must belong to your account or an organization in which you have publishing rights.

Verify from another folder:

```bash
npx @codeursenior/boyscout@0.1.0 ui
```

For later npm releases, update the workspace version and the root lockfile in Elrond, commit and push Elrond, synchronize the public mirror as usual, wait for CI, create the public GitHub Release, then publish npm. Each package has its own version. Published versions cannot be overwritten.
