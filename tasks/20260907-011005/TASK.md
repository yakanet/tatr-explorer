# `j` restarts from the top when the focus sits beside a row

- STATUS: CLOSED
- PRIORITY: 60
- TAGS: ui

`current()` locates the focus with `item === active || item.contains(active)`.
The tag buttons in a list row are siblings of the marked link, not descendants,
so tabbing to a tag and then pressing `j` jumps to the first row instead of the
next one.

Walk up from the focused element to the nearest `[data-key-row]` instead
(`active.closest('[data-key-row]')`) and fall back to the containment test for
anything that is inside a row without being one.

---

Fixed, and the fix prescribed above is wrong, which the browser said before
anything else did. `closest('[data-key-row]')` walks *ancestors*, and a tag
button is not inside the marked link: they sit in two sibling cells of the same
row. The mark is a cousin of the focus, never an ancestor of it, so the
containment test and `closest` fail for exactly the same reason.

What answers it is walking up until an ancestor is found that *holds* a mark.
The first one that does is the row itself.

With one bound, which the second attempt needed: an ancestor holding *several*
marks means the walk has climbed out of the row into something containing all
of them. From `<body>`, the first mark it finds is row one, so `j` moved to row
two instead of landing on row one. One mark is a row; more than one is the list.

Five cases checked in the browser, there being no test for a component yet
(20260906-232421): from a tag, `j` moves one row down and `k` one row up; from a
row, walking still works; and from nowhere, `j` lands on the first row and `k`
on the last.
