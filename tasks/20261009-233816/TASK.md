# A corpus of our own edge cases, recorded from the binary

- STATUS: CLOSED
- PRIORITY: 50
- TAGS: format,infra

tsoding/tatr is the corpus the differential tests replay, written by the
format's author with accidents nobody would invent. It lacks some cases only
because nobody wrote them, and those were checked by hand or not at all:
impossible dates, suffixes, a status that is neither, a missing `#`, a priority
given twice. A small corpus of our own, run through the same binary,
covers them without replacing the first.

---

`tests/fixtures/corpus-raw.json` holds 18 folders as name → `TASK.md`, one edge
case each, and `scripts/fixtures.mjs` (`pnpm run fixtures`) lays them out in a
temporary folder, runs the binary over them, and records `tatr ls`, `tatr ls -c`,
`tatr graph` and 14 queries. JSON rather than a `tasks/` folder, so nothing in
the repository looks like a backlog to a reader, or to the CLI run from `tests/`.

The same script records tsoding/tatr again and reproduced its six files byte for
byte: they were current. It also removes the `graph.dot` that `tatr graph`
leaves in the folder it runs in, which a first run by hand had left in
`../tatr`. Every recording keeps its own questions, so a case is added by
appending an entry and running it.

33 of 34 checks agree with the CLI on the first run: a missing `#` voids the
properties, trailing spaces stay in a title, the last of two priorities wins,
`WIP` and `closed` are not closed, tags are trimmed, a negative priority holds,
the defaults are 999999 and no tags, a folder named `notes` is skipped. The one
that does not is 20261009-233817: a task citing itself.

And one correction to what was believed: `tatr ls` sorts on priority alone, with
`qsort` and no tie-break, so equal priorities come out in no defined order. The
site's tie-break by id is ours. A test in `load.spec.ts` claimed "the order
`tatr ls` gives" for ties, and passed by coincidence; it no longer claims it.

The NOTICE now says the GPL is "version 2 or later", as tatr's headers do, no
longer calls `tsoding-tatr.json` a second invocation, and puts the `corpus-`
files under MIT.
