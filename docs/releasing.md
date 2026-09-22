# Releasing

The public source repository is `codeursenior/product-engineer-kit`. Each tool is an independent npm workspace. The root package is private to prevent accidentally publishing the entire kit.

Agent Visualizer lives in `packages/agent-visualizer`. Its npm package is `@codeursenior/boyscout`, with the `boyscout` executable.

## Validate from the repository root

```bash
npm ci
npm run check
npm pack --workspace @codeursenior/boyscout --dry-run
```

Review the package file list. Only the selected tool's source, prebuilt browser assets, package metadata, documentation and licenses belong in the archive. Private test repositories and temporary credentials belong in ignored `.local/` and must never be committed or published.

## Publish from the repository root

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

For later releases, update that workspace's version and the root lockfile, run checks, commit, push, and publish. Each package has its own version. Published versions cannot be overwritten.
