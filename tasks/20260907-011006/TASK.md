# The keyboard does nothing on the homepage

- STATUS: CLOSED
- PRIORITY: 50
- TAGS: ui

`Shortcuts` is mounted in `[...repo]/+layout.svelte`, so the only page without
keyboard support is the one a reader arrives on. `?` does not answer there, and
the repository cards carry no `data-key-row`, so `j`/`k` have nothing to walk.

Less a bug than a scope line drawn without saying so, which is why it is
recorded rather than left to be rediscovered. Moving the mount to the root
layout would cover both, and the actions it dispatches (switch view, focus the
query) have no meaning outside a repository, so the homepage wants a smaller
set: `j`/`k`, Enter and `?`.

---

The layer is mounted on the homepage rather than moved to the root layout: the
repository views need it wired to a nav and a query box that do not exist here,
and passing those up from below would cost more than one more mount.

`onview` became optional instead, so `1`-`9` are unwired rather than given
something invented for them. And the help panel stops advertising them, since a
page with no views has no view to switch to. That is the whole of the "smaller
set" this task asked for: what is left is real.

The repository cards carry `data-key-row`, so they are what `j` and `k` walk and
Enter opens: they are links, so Enter costs nothing. `/` focuses the box that
opens a repository, which is the same key that focuses the query elsewhere, on
the same `data-key-search` mark.

Checked in the browser: three cards walked with `j`, `k` and `G`, `/` lands in
the Repository box, `?` opens a list that no longer mentions `1 … 9`, and Escape
closes it.
