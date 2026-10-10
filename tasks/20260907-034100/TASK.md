# The header's three type sizes do not share a baseline

- STATUS: CLOSED
- PRIORITY: 60
- TAGS: ui

The brand, the repository path and the view links are set at three sizes and are
grouped precisely so they can align on one baseline. They do not: `tatr` sits
above the other two, which is visible at any zoom once looked for.

`.identity` asks for `align-items: baseline` and gets it. The problem is one
level down: `.brand` is itself a flex row, and its first child is the mark (a
drawing, with no baseline of its own). A flex container's baseline comes from
its first baseline-sharing item, so the row ends up aligning on an edge the
engine synthesised from the logo's box rather than on the word next to it.

Measured with the same font and size forced on all three, the glyph boxes start
at 12.2, 16.4 and 16.4: the brand is 4.2px high.

---

The mark sits out of the baseline group through `align-self: center` in `Mark`
itself, which is where the reason lives: an element with no baseline should not
be supplying one. That leaves the text as the only baseline-sharing item in
`.brand`, so the container's baseline is the word's, and `.brand` asks for
`align-items: baseline` to keep its own two children on one line.

Same measurement after: 14.3 for all four elements, exactly.

Centring rather than aligning the mark's own bottom edge is what puts its
artwork on the cap height of the word beside it: the strokes span 6.4 to 29.6
of a 32-unit box, so the drawn band lands on the caps with the circle dipping
just past the baseline, the way a round letter overshoots.

Both places carry a note, since `align-self` on a component's root looks like
stray styling until the baseline reason is said out loud.
