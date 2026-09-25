# Releasing

Elrond is the source of truth for the Product Engineer Kit. The public `codeursenior/product-engineer-kit` repository is a read-only mirror of Elrond's `product-engineer-kit/` subtree. Each tool remains an independent npm workspace, and the kit root stays private.

Agent Visualizer lives in `packages/agent-visualizer`. Its npm package is `@codeursenior/boyscout`, with the `boyscout` executable.

## Automatic release flow

A push to Elrond's `main` starts the private **Sync Product Engineer Kit** workflow only when `product-engineer-kit/` or its sync automation changes. It also runs daily and can be started with `workflow_dispatch` to retry a failed release.

The private workflow installs dependencies, builds and tests the kit, and compares the files that `npm pack` would publish with the current npm archive. It ignores the version field in `package.json` and normalizes line endings. A change outside the npm archive, including tests or another kit tool, synchronizes the mirror without releasing Boyscout. When publishable files have changed, the workflow commits the next patch version and root lockfile to Elrond's `main`, then pushes the complete kit subtree to the public mirror. An already bumped but unpublished version is reused on retry.

The public **Check and publish** workflow tests the mirror on each push. After those checks pass, it publishes a changed Boyscout package through npm trusted publishing and verifies that `latest` points to the new version. Its daily run retries a publication that previously failed. A changed archive with an already published version fails rather than attempting to overwrite it.

Check both workflows after a kit push. The private workflow must finish successfully, the mirror must contain the new subtree commit, and the public workflow must pass. When package files changed, check the installed version from a separate folder:

```bash
npx --prefer-online @codeursenior/boyscout@latest --version
```

The local fallback `./scripts/sync-product-engineer-kit.sh` validates and pushes the subtree but does not publish npm, create a tag or create a GitHub Release. It requires a clean kit and Elrond's committed `main` to match `origin/main`. Never edit or force-push the public mirror directly.

## One-time configuration

1. Enable GitHub Actions in Elrond and allow its `GITHUB_TOKEN` to push the automatic version commit to `main` (`contents: write`). Each local clone must pull that commit before its next push.
2. Add an Elrond Actions secret named `KIT_MIRROR_TOKEN`: a fine-grained GitHub token with **Contents: Read and write** on `codeursenior/product-engineer-kit` only. The private workflow uses it only for the mirror push. Keep all credentials outside the repository.
3. In the npm settings for `@codeursenior/boyscout`, configure a GitHub Actions trusted publisher for owner `codeursenior`, repository `product-engineer-kit`, workflow filename `ci.yml`, with direct `npm publish` allowed and no environment name. The publish job runs on a GitHub-hosted runner with `id-token: write` and npm 11.5.1.
4. Run the private workflow once to catch up the current code. Confirm the version commit, mirror push, public checks, and new npm `latest` before relying on the automation.

Only commit public-safe files under `product-engineer-kit/`. The npm archive must contain only the tool's source, prebuilt browser assets, package metadata, documentation and licenses. Keep local test repositories and temporary credentials in ignored `.local/` directories.
