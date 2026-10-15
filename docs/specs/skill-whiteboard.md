# Skills whiteboard

Status: approved

## Outcome

Turn the complete skill inventory into a visual production process aimed at a specific outcome. This is a visual planning tool. It does not execute skills or change their source files.

## Agreed behavior

- Skills offers two views: the existing Table and a Whiteboard, following Context's view switch.
- Every inventoried skill has one draggable rectangular card. Initial placement is alphabetical, side by side in rows. Skills cannot be hidden or removed from the board independently of the inventory.
- Explicit references in SKILL.md create directed, read-only arrows: Markdown links to another SKILL.md, file paths, and explicit invocations such as /grilling. Bare name mentions do not create arrows. Ambiguous references are left unconnected.
- User arrows have a separate color and line pattern. They can be added and deleted. Their ends attach to skill cards, follow card movement, and can be reassigned to other cards.
- Users can add, edit, move and delete free text titles to name outcomes or stages.
- Inventory changes appear only on startup or Rescan. Existing positions are preserved. Added skills appear beside the existing composition. Missing skills and their incident arrows disappear when the inventory is refreshed.
- The complete board is automatically saved in localStorage, independently for each canonical project path. Content edits preserve card identity using source file identities. This storage belongs to the browser and origin; clearing browser data removes it.
- The CLI defaults to port 4242. If occupied, startup fails with an explanation. An explicit --port override is allowed and uses separate browser storage. The programmatic server retains ephemeral ports for tests and embedded use.
- A future skill-map.json file is outside this version's scope.

## Interaction and verification

All skills remain on the whiteboard; list filters do not apply there. Pan, zoom and fit keep large inventories navigable. Arrow keys move focused cards and titles. Keyboard selection, endpoint menus and delete buttons complement pointer gestures. Colors distinguish source references from local drawings; a legend and solid/dashed lines also distinguish them.

Validate scan behavior through synthetic filesystem fixtures, board persistence and reconciliation through the rendered Angular component, CLI startup through child processes, and gestures plus production CSP in Chromium. Existing Context, Table and file operations retain their regression checks.
