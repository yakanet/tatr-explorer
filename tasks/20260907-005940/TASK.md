# The board has no filter bar

- STATUS: CLOSED
- PRIORITY: 80
- TAGS: ui,tql

20260906-211227 shipped the board without the query bar the list has, so there
is no way to look at one part of it: `:ui`, or `priority ge 90`, or `~windows`.

It is wanted here for a different reason than on the list. The dashboard
deliberately has no filter, because a chart of a subset says things that are
untrue of the repository and the reader is left interpreting a picture. A board
is not a summary: filtering it narrows what each column holds and the columns
still mean exactly what their headers say. Filtering by tag is also the closest
thing this format has to a swimlane.

Mostly reuse. `QueryState` already lives in the layout, so a filtered board
would share the query with the list: go to the list from a filtered board and
find the same filter, which is the behaviour everywhere else. Two things to
settle:

- **What the counts count.** A column header showing 21 while displaying 3 is a
  lie; showing 3 loses the sense of how much was set aside. Probably `3 / 21`.
- **What the `closed` toggle means here.** Done *is* the closed column, so
  hiding closed tasks would empty it. Either the toggle disappears on this view
  or it hides the column outright, which is arguably what a reader asking for
  open tasks wants.

---

Done, and both open questions turned out to have one answer each.

**Headers say `3 / 21`.** `toColumns` takes the query as a predicate applied
*within* a column rather than before it, so a card is counted in the column it
belongs to whether or not it matched; the query can narrow a column and never
move a card between two. `:tql` with closed shown reads Backlog 2/21, In
progress 0/2, Done 6/41.

**The closed toggle is gone from this view**, which was the first of the two
options and the right one. Closed tasks are a column here, so the switch was
answering a question the board already answers by its shape. And the version
that hid the Done column meant a reader could arrive from the list to find a
third of the board missing with nothing on screen to say why. `QueryBar` takes
`closedToggle`, and the board shows its three columns always.

That still needed `QueryState.matches(task)` (the query without the status
filter) because `apply` would otherwise have dropped closed tasks before the
columns existed, emptying Done rather than narrowing it. `apply` is now
`matches` plus the filter rather than a second implementation.

The query is shared with the list, so a filter set in either is there in the
other, which is how the rest of the product already behaves.
