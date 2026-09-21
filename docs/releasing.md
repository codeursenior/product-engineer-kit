# Releasing

The source repository is `codeursenior/agent-visualizer`. The npm package is `@codeursenior/boyscout`, with the `boyscout` executable. The unscoped `boyscout` package belongs to another publisher.

## Validate

```bash
npm ci
npm run check
npm pack --dry-run
```

Review the tarball file list. Only `src/`, `public/`, package metadata, README and licenses belong in the npm package. Private test repositories, screenshots and temporary credentials belong in ignored `.local/` and must never be committed or published.

## Publish

Sign in with an npm account allowed to publish in the `@codeursenior` scope. To keep authentication files local to this checkout:

```bash
npm login --userconfig .local/npmrc --cache .local/npm-cache
npm whoami --userconfig .local/npmrc --cache .local/npm-cache
npm publish --access public --userconfig .local/npmrc --cache .local/npm-cache
```

Complete any browser authentication or 2FA yourself. If the scope does not belong to your account, create the organization or choose an owned scope before publishing.

Then verify from a different folder:

```bash
npx @codeursenior/boyscout@0.1.0 ui
```

For later releases, update the package version and lockfile, run checks, commit, push, and publish the new version. Published versions cannot be overwritten.
