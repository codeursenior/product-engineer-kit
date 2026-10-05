# Updating browser snapshots

Visual comparisons run on Windows with the Chromium version in the lockfile.
After an intentional UI change, run **Refresh browser snapshots** on
Elrond's `main` branch. The workflow captures every reference, reruns the strict
comparisons, and uploads the images as the `browser-snapshots` artifact. It does
not commit files or publish a package.

Download that artifact, review every changed image, and copy the approved PNGs
into `packages/agent-visualizer/test/browser/snapshots/` in Elrond's
`product-engineer-kit/` directory. Commit and push those references from Elrond.
The normal **Check and publish** workflow must pass against the committed images
before publication. Never generate Windows references on another platform or
increase visual tolerances to accept an intentional UI change.
