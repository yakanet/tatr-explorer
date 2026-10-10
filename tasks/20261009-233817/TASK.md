# A task that cites itself is drawn by `tatr graph` and dropped here

- STATUS: CLOSED
- PRIORITY: 70
- TAGS: format,ui

Found by the corpus of 20261009-233816: when a task's text holds its own id,
`tatr graph` writes an arrow from the task to itself into `graph.dot`. This
viewer drops it twice (`extractReferences` in `src/lib/tatr/task.ts` skips the
task's own id, and `buildGraph` in `src/lib/tatr/graph.ts` filters it again), so
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

---

Done as listed. `extractReferences` keeps the task's own id and `buildGraph`
no longer filters it, so the corpus's graph matches `tatr graph` arrow for arrow
and its known-failure mark is gone.

A self-arrow is a `GraphEdge` whose ends are the same task, never `mutual`. It
counts in `linkCount`, and its task is no longer isolated. In `starCards` it
counts once towards choosing pivots and lands on its own card as `self: true`
rather than as a neighbour, so a task citing only itself gets a card with no
spoke. On screen that is an unnumbered "↺ Cites itself" line under the
numbered ones, the key gains "↺ cites itself" only when a card needs it, and
"N links here" and a neighbour's "+N" count it. The task page ends its
References panel with "cites itself" instead of listing the task as mutual.

Checked on this repository, where 20260907-173535 cites itself: its card reads
"4 links here" with three spokes and the line, and its page shows the line.
