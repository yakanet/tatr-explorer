# Esc does not close the keyboard panel

- STATUS: CLOSED
- PRIORITY: 100
- TAGS: ui

The panel lists `Esc` as `close, or leave the box` and Esc does nothing to it.
Only the Close button works, which is the one thing a keyboard panel should not
require.

`KeyHelp` focuses itself on open, then carries
`onkeydown={(event) => event.stopPropagation()}` on the panel, added so a key
pressed inside it would not reach the backdrop. With the focus inside, that stop
also keeps Escape from reaching `<svelte:window>` in `Shortcuts`, which is where
`dismiss()` lives, so the shortcut the panel advertises is the one it swallows.

Handle Escape in `KeyHelp` itself rather than relying on the layer it is
blocking, or stop only what actually needs stopping. Whichever way, the fix
belongs with 20260907-011002: a panel that owns its own Escape is also a panel
that has to hold the focus.

---

Fixed by giving the panel its own Escape, which is both shorter and the reason
nothing needs stopping any more.

The `stopPropagation` on keydown was there to keep a key pressed inside the
panel from reaching the backdrop, whose only keyboard handler existed to satisfy
the a11y rule about clickable divs. Removing that handler removed the need for
the stop: the backdrop closes on click, the panel closes on Escape, and neither
has to know about the other. svelte-check is content, which is worth noting:
the original handler was written to please it and is what caused the bug.

Verified in order: `?` opens and the focus lands on the dialog, Escape closes
it, and `j` walks the list again afterwards.
