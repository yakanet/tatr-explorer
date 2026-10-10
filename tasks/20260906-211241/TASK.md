# Keyboard navigation across every view

- STATUS: CLOSED
- PRIORITY: 90
- TAGS: ui

`j`/`k` to move, `/` to focus the query, Enter to open, Escape to close or
clear, `g g` for top, `?` for help, `1`-`4` to switch view.

Focus management and visible focus states have to be done properly rather than
bolted on; that is the cost of the TUI feel.

---

Done. `j`/`k`, arrows, `g g`, `G`, `Home`/`End`, `/`, `1`-`9`, `?` and Escape,
with `keys.ts` holding the map as a pure function of the key and the pending
sequence (24 tests, no browser). An unrecognised key disarms a half-typed `g`,
because leaving it armed would turn the reader's next `g` into a jump nobody
asked for.

One implementation serves every view. A view marks what is navigable with
`data-key-row`, and `Shortcuts.svelte` reads them out of the document in drawing
order: 17 on the dashboard, 23 in the list, 30 in the graph. Marking a focusable
element is also what keeps Enter working without a line of code: the row *is* a
link.

Two things the task called for and that turned out to be the substance of it.

**`:focus-visible` cannot carry a focus we move ourselves.** The browser decides
when to match it, and only does so when it judges the current interaction to be
a keyboard one, which it does not reliably do for a scripted `focus()`. Since
`j`/`k` are useless without a visible focus, the keyboard layer sets its own
`data-key-focus` and the styles answer to both.

**Those styles live in `app.css`, not in each view.** Svelte's scoped CSS prunes
selectors it cannot find in the markup, and `data-key-focus` only exists at
runtime, so a scoped rule was silently dropped as unused; svelte-check said so
once the selector was written. The convention is shared anyway: any view putting
a `data-key-row` in a `tr` gets the row band, an SVG node gets a ring on the
circle, anything else gets the plain outline.

Escape is layered: the first one closes the completion menu and stays in the
box, consuming the event so the shortcut layer leaves it alone; the second gives
up the field. One keystroke doing both would leave no way to close the menu
without also leaving the box.
