# Releasing

Elrond is the source of truth for the Product Engineer Kit. The public `codeursenior/product-engineer-kit` repository is a read-only mirror of Elrond's `product-engineer-kit/` subtree. Each tool remains an independent npm workspace, and the kit root stays private.

Agent Visualizer lives in `packages/agent-visualizer`. Its npm package is `@codeursenior/pek`, with the `pek` executable.

## Automatic release flow

A push to Elrond's `main` starts the private **Sync Product Engineer Kit** workflow only when `product-engineer-kit/` or its sync automation changes. It also runs daily and can be started with `workflow_dispatch` to retry a failed release.

The private workflow installs dependencies, builds and tests the kit, and compares the files that `npm pack` would publish with the current npm archive. It ignores the version field in `package.json` and normalizes line endings. A change outside the npm archive, including tests or another kit tool, synchronizes the mirror without releasing PEK. When publishable files have changed, the workflow commits the next patch version and root lockfile to Elrond's `main`, then pushes the complete kit subtree to the public mirror. An already bumped but unpublished version is reused on retry.

The public **Check and publish** workflow tests the mirror on each push. After those checks pass, it publishes a changed PEK package through npm trusted publishing and verifies that `latest` points to the new version. Its daily run retries a publication that previously failed. A changed archive with an already published version fails rather than attempting to overwrite it.

Check both workflows after a kit push. The private workflow must finish successfully, the mirror must contain the new subtree commit, and the public workflow must pass. When package files changed, check the installed version from a separate folder:

```bash
npx --prefer-online @codeursenior/pek@latest --version
```

The local fallback `./scripts/sync-product-engineer-kit.sh` validates and pushes the subtree but does not publish npm, create a tag or create a GitHub Release. It requires a clean kit and Elrond's committed `main` to match `origin/main`. Never edit or force-push the public mirror directly.

## First publication as PEK

`@codeursenior/pek` is a new npm identity. Keep Agent Visualizer as the product name and retain the current version for the first PEK publication. The root manifest remains private. The legacy `@codeursenior/boyscout` distribution is no longer maintained; use PEK for all new releases. See the retirement procedure below for the old npm identity.

Before the first release, check `npm view @codeursenior/pek name version --json` and `npm whoami`. A registry 404 means no public package was found; it does not establish the caller's right to publish in the scope. Confirm that the npm account can publish under `@codeursenior`. Authentication and registry failures other than 404 must be resolved, not treated as a missing package.

If the package does not yet exist and its trusted publisher cannot be configured, bootstrap it from the archive produced by the public workflow after all checks pass. Authenticate with `npm login` as an authorized maintainer, download the **pek-package** artifact from that same successful check run, and publish its `.tgz` with `npm publish /path/to/codeursenior-pek-VERSION.tgz --access public`, completing npm's authentication prompts. Do not publish an empty placeholder or the private root package. A failed publish job does not invalidate successful check, browser and package jobs; confirm those gates before bootstrapping.

Then configure the new package's trusted publisher using the settings below. The previous package's trust configuration does not transfer. See [npm's trusted publishing documentation](https://docs.npmjs.com/trusted-publishers/) for account setup. Re-run **Check and publish** through `workflow_dispatch` after configuration or an authentication failure. If the archive is already published, the comparison skips publication; if it is absent, the same local version is retried. An archive change after successful publication requires the next patch version through the private sync workflow.

After publication, run from a separate folder:

```bash
npx --yes --prefer-online @codeursenior/pek@latest --version
npx @codeursenior/pek audit agent
```

Verify that [the npm package page](https://www.npmjs.com/package/@codeursenior/pek) displays Agent Visualizer, the `audit agent` examples, and the public kit repository and documentation links. The package README and metadata generate this page. An archive tested locally or uploaded as a workflow artifact is not a published npm release.

## Retiring the legacy Boyscout package

The legacy package is intended for removal, without a compatibility guarantee. Check the [current npm unpublish policy](https://docs.npmjs.com/policies/unpublish/), package versions, owners and weekly downloads before running `npm unpublish @codeursenior/boyscout --force` as an authorized owner. Keep this operation separate from PEK publication and its trusted publisher.

On October 14, 2026, npm rejected the authenticated removal with HTTP 422. The package had one owner, no declared public dependents and 392 weekly downloads. Packages older than 72 hours must have fewer than 300 weekly downloads, no public dependents and a single owner to qualify for removal under the current policy. Recheck eligibility before retrying.

All eight versions, `0.1.0` through `0.1.7`, remain published and were deprecated with this message: `This package is no longer maintained. Use npx @codeursenior/pek audit agent instead.` Deprecation displays a migration warning but leaves the old command usable. Verify both the registry's `deprecated` fields and an invocation with a fresh test cache; do not describe deprecation as removal. Removing the package from npm cannot disable copies already installed or cached on users' machines.

## One-time configuration

1. Enable GitHub Actions in Elrond and allow its `GITHUB_TOKEN` to push the automatic version commit to `main` (`contents: write`). Each local clone must pull that commit before its next push.
2. Add an Elrond Actions secret named `KIT_MIRROR_TOKEN`: a fine-grained GitHub token with **Contents: Read and write** and **Workflows: Read and write** on `codeursenior/product-engineer-kit` only. Workflow permission is required when the exported subtree changes `.github/workflows/ci.yml`; a classic token needs the `workflow` scope as well as repository access. The private workflow uses it only for the mirror push. Keep all credentials outside the repository.
3. In the npm settings for `@codeursenior/pek`, configure a GitHub Actions trusted publisher for owner `codeursenior`, repository `product-engineer-kit`, workflow filename `ci.yml`, with direct `npm publish` allowed and no environment name. The publish job runs on a GitHub-hosted runner with `id-token: write` and npm 11.5.1.
4. Run the private workflow once to catch up the current code. Confirm the version commit, mirror push, public checks, and new npm `latest` before relying on the automation.

Only commit public-safe files under `product-engineer-kit/`. The npm archive contains compiled Node ESM and Angular browser assets under `dist/`, package metadata, documentation and licenses. TypeScript sources, tests, development tools, caches, and local fixtures are excluded. Keep local test repositories and temporary credentials in ignored `.local/` directories.

Development and release builds use Node 24. Before publication, the public workflow requires strict type/lint/build checks and Vitest on Linux, macOS and Windows, Chromium interaction and screenshot checks on Windows, and production-only installation of one archive across Node 20/22/24 on all three operating systems. Scheduled publication retries pass the same gates. Build outputs are ignored and repeated builds must produce identical distribution contents; session credentials and CSP nonces are generated only at runtime.
