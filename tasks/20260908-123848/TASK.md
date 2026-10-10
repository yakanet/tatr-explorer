# Say what is MIT here and what is not

- STATUS: CLOSED
- PRIORITY: 50
- TAGS: infra

The reference implementation is under the GPL, version 2, and this repository
declares MIT. The question is whether that is allowed when no line of tatr's C
is used. It is, but not for the whole tree, which is what took the reading.

**The viewer itself is MIT and defensible.** Copyright protects expression, not
ideas, formats or behaviours: `tasks/<huid>/TASK.md` with its `- KEY: value`
lines, the query grammar, the sort order. Those are specifications. Writing an
independent implementation of them in another language is interoperability, and
the copyleft of the GPL attaches to derivative works of the covered code, of
which there is none here.

**The fixtures are the exception, and they are not ours to relicense.**
`tests/fixtures/tsoding-tatr-raw.json` holds the complete text of 64 `TASK.md`
files from the reference repository: 33 kB of somebody else's prose.
`tatr-ls-output.json` and `tsoding-tatr.json` carry their titles;
`tatr-query-errors.json` carries the diagnostics `src/query.c` prints. Ids,
statuses, priorities and tags, in the other two, are much closer to facts than
to expression.

So a `NOTICE` now states it: MIT everywhere, except those recordings, which are
GPL-2 and the work of tatr's authors, kept as test data because the suite
replays them field by field. The README says the same where it describes them,
and `LICENSE` was left untouched so the licence of the code stays machine
readable.

Two alternatives were weighed and refused. Regenerating the fixtures from this
repository's own tasks would make the tree purely MIT and cost the corpus that
catches what we would not have thought to write. Dropping only the raw bodies
would keep most of the value, but for a file that a notice covers just as well.

Left open, and worth a decision rather than a silence: `huid.ts` says
`chopHuid` is "a direct port of `chop_huid`", and its shape does follow the C
loops deliberately. A translation is a derivative work, so the strongest form
of the claim above, that nothing was translated, is not one this code can
make today. Fifteen lines rewritten from the behaviour would earn it. Two
diagnostics in `query.ts` are also copied verbatim from `src/query.c`; short
enough to be below the threshold of originality, but the `NOTICE` says where
they come from rather than claiming them.

Not legal advice, and it was not written by a lawyer. What it is: the facts
about which files carry whose work, written down where a reader will find them.

---

`chopHuid` is rewritten, so the claim the NOTICE could not make is now made:
nothing here is copied *or translated*.

It reads the id off the format as one sticky pattern rather than as the two
digit loops it used to mirror: a declarative shape in this language's terms
instead of a transliteration of somebody else's control flow. Thirty-one lines
became eight, which was not the point but is not a loss either.

What made the rewrite safe was closing a gap first. The behaviour that decides
where a scan *ends* (the end of the text ends an id, so a time cut short by it
is accepted while the same thing before a space is not) was pinned by no test
at all. Four cases now cover it, written against the old implementation and
passing before a line of it changed; the rewrite then had something to be
judged by.

Proved by breaking it three ways: dropping the end-of-text alternative fails
the truncation cases, adding a word boundary fails the glued-id cases, and
making the suffix lazy fails the team-suffix case **and the differential graph
test**, the fixture recorded from the real binary catching a wrong suffix rule
over 64 real tasks. That last one is the guarantee this project actually rests
on.

The comments followed the code. Five said "ported from" or "a port of", which
invites exactly the reading the rewrite was meant to remove; they now say where
the behaviour is *defined* rather than where the code came from. The two
diagnostics in `query.ts` stay verbatim on purpose (a query is meant to move
between the two tools unchanged, and so is the complaint about it), and the
NOTICE names them as quotations.

