# Open the list from the dashboard's counts

- STATUS: CLOSED
- PRIORITY: 60
- TAGS: ui

The masthead's three counts are numbers a reader wants to see behind. Each
should be a link to the list, filtered to exactly the tasks it counts:

- **in total** — the list with closed tasks included: `?closed=1`.
- **untagged** — counted over every task, open or closed, so `not tagged`
  with closed included: `?q=not+tagged&closed=1`.
- **closed** — the closed tasks alone, which the list cannot show today.

That last one is the real work. The list's `closed` chip *adds* closed tasks
to the open ones, while upstream's `tatr ls -c` lists closed tasks *only*
(`ls_run` skips every task that is not `CLOSED` under `-c`), and the query
language has no status primary to say it either. Either the chip becomes a three-way choice
(open, closed, both) or the URL gains a closed-only mode; whichever it is, the
count on the tile and the count the list reports must be the same number.

The chip's own comment in `QueryBar.svelte` calls it "the CLI's `-c`", which it
is not: that is a divergence from the reference nobody argued for, and this
task is the place to either argue it in the README or remove it.

The lead's open count ("33 tasks still open") is a candidate too: it is the
list as it opens, with no parameter at all.

A tile that is a link needs to look like one without looking like a button:
a hover and the focus ring, and the 44px target it already has.

---

Done. The three counts are links to the list, and each lands on its own
number: `?status=closed`, `?q=not+tagged&status=all`, `?status=all`.

The closed chip became a three-way status, `open · closed · all`: `open` is
`tatr ls`, `closed` is `tatr ls -c` — closed tasks only, as the C has it — and
`all` is ours, argued in the README beside `~`. The chip's claim to be `-c` is
gone with it. `closed=1` links still open, as `all`.

For a plain link to set the query, the layout now reads it from the URL on
every navigation, not only on arrival, and before the new page renders. Two
rules keep that from wiping what the reader built: a URL sets only what it
carries, and each view's address carries only what that view uses — the text
for the list and the board, the status for the list alone. Without the second,
the status rode along to the board, which ignores it. The list writes its status
even when it is `open`: an address without one, reached again through history,
would have kept whatever status was chosen since.

Not done: the lead's open count is not a link. It sits inside the headline's
sentence, and the list it would open is the one the nav already opens.
