# Say what changed since the reader's last visit

- STATUS: CLOSED
- PRIORITY: 55
- TAGS: data,ui

A refresh replaces the cached snapshot and says nothing about what moved. The
snapshot it overwrites holds every id with its status, priority and tags, which
is exactly what is needed to answer the question a reader actually has on
arriving: *what happened since I last looked?*

Keep the previous snapshot alongside the new one and compare:

    3 closed, 1 opened, 2 repriorised since your read of 6 September

with those rows marked in the list, and the marks clearing once acknowledged.

No request is added: both states are already local. It turns the cache from a
constraint into the feature: the cache never expiring on its own is a decision
about the reader's rate limit, taken in 20260906-211159, and this is what that
decision buys back.

The CLI cannot do this at all. It reads a folder as it stands and holds no
memory of how it stood before, so a comparison is not an addition to anything it
expresses: nothing to diverge from.

Two things to settle while doing it: the cache is metadata only, so a title
change is invisible and a description change doubly so; the comparison must
claim only what it can see. And a repository read for the first time has nothing
to compare against, which is the common case for a link someone was sent, so the
whole panel has to be absent rather than empty.

---

Done, and it costs exactly what it was supposed to: nothing on the wire.

`loadRepository` reads the record once more before the write that would lose it
(only on a refresh, a first visit having nothing behind it) and stores the
snapshot inside the record it is replacing. So the news survives a reload and a
navigation, because it lives where the reading lives rather than in memory.

`compare` is where the thinking went. Six movements, not three: `added`,
`closed`, `reopened`, `repriorised`, `retagged`, `removed`. Three of those were
not in the sketch above and each earned its place:

- `reopened` is not `added`. A task coming back open is a different event from a
  task appearing, and collapsing them would have read as a new task that is not.
- a task that arrives already closed is `added` alone. There was nothing for it
  to move from, so calling it new *and* closed would invent an event.
- `retagged` is the interesting one, because `scope` is a tag: this repository's
  convention is that exactly one task carries it, so "retagged" is how "someone
  started on this" reaches the screen at all. Tags compare as sets: a reordered
  list is not news.

A task can move twice, which the model carries as a list per task rather than
one kind. The counts then add up to more than the total, and that is a property
worth stating rather than papering over: three categories of one task each can
be the same task three times.

What the reader sees is only the rows: a word beside the title (`new`,
`closed`, `retagged`) in the list and on the board's cards, with the whole list
and the age of the comparison on hover. Not a coloured band on the row, because
the row band already means "the keyboard is here" and one channel cannot carry
two meanings.

There is no summary anywhere, and that took two tries to arrive at. It was first
a strip under the header, which read as an alert for something that is not an
alert: full width and coloured for three words. Then a chip beside the age,
`5 moved ✕`, which was still a count of something the rows say better. Both were
cut on review, and the second time settled the question rather than moving it:
if the rows carry the news, nothing else should.

Two things are given up with them, deliberately. A task whose folder is gone has
no row, so `removed` is now computed and never shown; and a task the query or
the closed toggle filters out is not on screen to be marked, though the board's
Done column does show the closed ones. The alternative was a permanent counter
for a rare event.

A movement is now spelled as the word a badge shows (`new`, `gone` rather than
`added`, `removed`) because that badge is the only thing that reads them, and
any other naming buys a lookup table to keep in step with the type. The tooltip
is built once, next to the age it quotes, rather than as the same expression in
two templates; the badge itself is one rule in `app.css`, beside the other
conventions shared between views.

Nothing dismisses the news either, which is the part that got simpler rather
than poorer: the comparison belongs to the reading that produced it, so the
marks stand until the next refresh, which is a new reading and takes the old
comparison with it. `forgetPreviousReading` and its state method existed for a
button that no longer exists, and went with it. So did the `counts` breakdown in
the model: its only reader was the summary.

`changes` is null rather than an empty result when nothing moved, so a view has
one thing to test and no way to mark a row for having done nothing, which is
also what covers the first visit the ticket asked about.

One bug found while wiring it: a single `RepositoryState` serves every view, and
nothing reset the snapshot at the start of a load, so moving from one repository
to another announced the first one's news over the second one's tasks. A
comparison belongs to the reading that produced it, and `load` now says so.

The card places its badge on the meta line with the tags, not inline after the
title as the list does, the two views disagreeing here on purpose. A card's
title wraps, and a badge in that flow lands alone on a line of its own as soon
as the last word reaches the card's edge, which is what a reader sees as a badge
out of place. On a line that already exists it is simply the first thing on it.
The badge keeps one look, in `app.css`; spacing belongs to whichever view puts
it somewhere, so the shared rule carries none.

One trap hit twice now: the tag comparison first joined on a NUL, which is a
fine separator and makes git store a `.ts` file as binary, the same thing that
happened to the reference graph. A comma does the job, the format splitting tags
on it, so no tag can contain one.

Verified on screen by planting a reading that differs in five ways: the badges
land on the right rows in both views, a task that both closed and moved priority
carries both words in its tooltip, and the header is back to nothing but its age
and Refresh.

Left undone: the dashboard's own table of highest-priority tasks is not badged.
It is a summary of the list rather than the list, and it was not asked for.
