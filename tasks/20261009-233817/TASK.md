# A task that cites itself is drawn by `tatr graph` and dropped here

- STATUS: OPEN
- PRIORITY: 70
- TAGS: format,ui,scope

Found by the corpus of 20261009-233816: when a task's text holds its own id,
`tatr graph` writes an arrow from the task to itself into `graph.dot`. This
viewer drops it twice — `extractReferences` in `src/lib/tatr/task.ts` skips the
task's own id, and `buildGraph` in `src/lib/tatr/graph.ts` filters it again — so
the graph has one arrow fewer than the CLI's, and the count of citations differs.
The corpus test marks that comparison as a known failure until this is closed.

The fidelity rule decides it: nothing the reference implementation expresses may
behave differently here, so the self-citation is kept. What has to follow:

- **The data.** Both filters go.
- **The graph.** A self-arrow is not mutual, though "A cites A" reads the same
  both ways: it needs a kind of its own beside `in`, `out` and `both`. It counts
  in `linkCount`, as in the `.dot`, and a task that cites only itself is no
  longer isolated. `starCards` must not make a task its own neighbour.
- **The references view.** No spoke for it: a line "cites itself" in the card's
  list, with a glyph of its own in the key. A card may then hold that line and
  no spoke, and has to stay readable.
- **The task page.** The References panel would list the task as both "refers
  to" and "refers here", hence "mutual". It shows one "cites itself" line
  instead.
- **Tests** for the new kind; the comments that say self-references are removed.

Not affected: an id in a body is still not linked to the page it is on.

This repository has one: 20260907-173535 cites itself, the example id swapped for
its own when the site ignored self-citations. It will show as one. Readers' caches
hold references computed before, so a self-citation appears after a Refresh.
