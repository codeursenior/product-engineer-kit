# Source of truth and public mirror

The Product Engineer Kit is developed in the private Elrond monorepo. The `product-engineer-kit/` directory is tracked directly by Elrond, so it has no nested `.git` directory and no independent local branch.

This public repository is a read-only release mirror. Issues are welcome, but changes and pull requests must be applied in Elrond before the next synchronization.

## Daily development

Work from the Elrond repository and create dedicated commits for kit changes:

```bash
git diff -- product-engineer-kit
git add product-engineer-kit
git commit -m "fix(product-engineer-kit): describe the change"
```

Commit messages, authors and every file under `product-engineer-kit/` can become public. Never place private Elrond assets, credentials or test repositories in this directory.

Whenever a kit change is pushed to Elrond's `origin/main`, the private GitHub Actions workflow validates and synchronizes the public mirror. Check that the workflow succeeds before treating the push as complete:

```bash
git push origin main
```

Verify that the new commit is visible on the public `main` branch and that its GitHub Actions check succeeds. If automation is unavailable, run `./scripts/sync-product-engineer-kit.sh` from a clean Elrond `main`, then check the public workflow. The script itself does not publish npm.

## Public synchronization

The private workflow exports only the `product-engineer-kit/` subtree after each pushed kit change. The public mirror must never be edited or force-pushed directly. See [releasing.md](releasing.md) for the automatic synchronization and npm publication sequence.

A public clone remains a normal standalone repository for users. It has no runtime dependency on Elrond.
