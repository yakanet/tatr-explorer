# The keyboard panel does not hold the focus

- STATUS: CLOSED
- PRIORITY: 70
- TAGS: ui

`Shortcuts.rows()` queries the whole document, so while the keyboard panel is
open `j`/`k` walk the rows behind it, moving the focus out of a dialog that
declares `aria-modal="true"`.

Either the panel traps the focus, or the shortcut layer stops navigating while
something modal is open. The second is less code and reads better: the layer
already knows when the panel is up, since it is what opened it.

Same area as 20260907-011001, and the two are best done together.

---

Fixed with the second option, as expected: `Shortcuts` takes a `modal` prop and
ignores everything but `help` and `dismiss` while it is true. Four lines against
a focus trap, and the layer already knew: it is what opened the panel.

`?` still toggles the panel shut, and Escape now belongs to the panel itself
(20260907-011001), so the two keys a reader would reach for both work while
nothing behind moves.

Verified: `j` with the panel open leaves the focus on the dialog instead of
walking the rows underneath.
