# Board with columns built from tags

- STATUS: CLOSED
- PRIORITY: 90
- TAGS: ui

Columns come from tags rather than status, since status has only two values.
The `scope` tag means "currently working on" upstream, which makes a real
in-progress column: Backlog (open, no `:scope`), In progress (`:scope`), Done
(closed).

This matches the conclusion of upstream task 20260826-200847: "Maybe if the
people want to kanban this entire thing they should just use tags for that?"

Read-only, so cards cannot be dragged.

---

Reuses the row and detail work from 20260906-211220.

---

Done, at `/{owner}/{name}/board`: Backlog 21, In progress 2, Done 41 on
tsoding/tatr, every one of the 64 placed exactly once.

"Columns from tags" read literally does not work, and the numbers say why: 10 of
those 64 tasks carry more than one tag, so a column per tag would show the same
card in several at once. Tags there are categories (`bug`, `ui`, `tql`), not
steps. `scope` is the exception and the reason a board is possible: upstream it
means "currently working on", which is a stage. Hence closed, `scope`, and
everything else.

Closed wins over `scope`, so a task left tagged after being finished lands in
Done rather than twice. And the convention of one task in progress at a time is
ours, not the format's: tsoding/tatr carries two, so a board assuming one would
have dropped a card. Tested with several.

Done is sorted newest first rather than by priority, which is upstream task
20260304-115038 in a sentence: "Priority becomes irrelevant when the task is
closed". The id is the closest thing to a date the format holds. Its cards
recede too: no fill, and the priority in muted ink, present without pretending
to matter.

Each column scrolls on its own. Letting the page grow to fit 41 cards pushed the
other two headers off the top, and a board whose columns cannot be compared is a
list, except stacked on a narrow screen, where a scroll box inside a scrolling
page is what makes a phone unusable.

Keyboard came free, as hoped: one `data-key-row` on the card and 20260906-211241
walks all 64. `4` reaches References now that Board is third.
