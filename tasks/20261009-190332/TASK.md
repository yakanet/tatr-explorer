# Open the list from the dashboard's counts

- STATUS: OPEN
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
