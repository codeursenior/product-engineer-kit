# Releasing

Elrond is the source of truth for the Product Engineer Kit. The public `codeursenior/product-engineer-kit` repository is a read-only mirror of Elrond's `product-engineer-kit/` subtree. Each tool remains an independent npm workspace, and the kit root stays private to prevent accidentally publishing the entire repository.

Agent Visualizer lives in `packages/agent-visualizer`. Its npm package is `@codeursenior/boyscout`, with the `boyscout` executable.

## Validate and synchronize from Elrond

```bash
./scripts/sync-product-engineer-kit.sh
```

The script requires Elrond's committed `main` branch to match `origin/main`. It installs dependencies, runs the complete checks, previews the npm archive and pushes only the kit subtree to the public mirror. It never publishes npm, creates a tag or force-pushes.

Review the package file list. Only the selected tool's source, prebuilt browser assets, package metadata, documentation and licenses belong in the archive. Private test repositories and temporary credentials belong in ignored `.local/` directories and must never be committed or published.

Wait for the public GitHub Actions workflow to pass before continuing. Create the public GitHub Release and its tag against the mirror's `main` branch; never push an Elrond tag to the public repository.

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

For later releases, update the workspace version and the root lockfile in Elrond, commit and push Elrond, synchronize the public mirror, wait for CI, create the public GitHub Release, then publish npm. Each package has its own version. Published versions cannot be overwritten.
