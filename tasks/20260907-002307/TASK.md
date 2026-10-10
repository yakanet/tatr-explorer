# Replay the CLI's error output, not only its results

- STATUS: CLOSED
- PRIORITY: 100
- TAGS: tql,infra

The 34 differential invocations compare which tasks a *valid* query returns.
Nothing compares what an invalid one prints, and five divergences were found
there by hand in one sitting: the wording of a missing primary, of an
unrecognised one, of two primaries meeting, `Expected \`]\`.` losing its full
stop, `empty tag` losing its lowercase, and a caret drawn as a run instead of
the single `^` the C prints.

Every one of those was invisible to the suite. Add a fixture of invalid queries
with the binary's complete stderr (the help block, the source, the caret line,
the message) and compare `formatDiagnostic` against it byte for byte.

Cases the fixture should hold, being the ones that hit distinct branches:

    :               empty tag
    (empty)         primary missing at the end
    priority and    primary missing after an operator
    priority lt     same, after a comparison
    nope            unrecognised primary
    ]               unrecognised primary, bracket
    [               primary missing inside a group
    [:bug           unclosed group
    :bug not :ui    two primaries meeting
    :bug]           same, with a bracket
    5               ill-typed: integer where a boolean belongs
    :bug and 5      same, on the right of an operator
    .bug            deprecated spelling, which warns rather than fails

Two things the comparison has to allow for, both deliberate and both documented
where they are done: the `ERROR: ` prefix is dropped, and the primary list gains
the `~` lines that come with 20260906-235936.

Regenerating means running each case through the checkout at `../tatr` and
capturing stderr, so it is a manual step like the other two fixtures.

---

Done, as `tql.diagnostics.spec.ts` against `tatr-query-errors.json`: twelve
invalid queries with the binary's complete stderr, compared whole.

It found two more divergences while being written, which is the argument for it.
The deprecation warning was truncated by half (the reference says "deprecated
and will be removed in the future"), and the CLI renders a warning with source
and caret exactly as it renders an error, so `formatDiagnostic` takes either
now.

The empty query turned out not to be a case. `tatr ls ''` exits 0, which looked
like a divergence until `tatr.c` gave it up: `if (src.count == 0) src =
sv_from_cstr("any")` happens in the caller, never in the compiler. `parse('')`
throwing is faithful, and `QueryState` already substituted the same thing.

One design fault fell out of it. The spec's own renderer reproduced the bug that
took a page to 500 (parsing without evaluating, so type errors escaped), and
two callers finding the same hole means the hole was in the wrong place. The
type check moved into `compile()`, which is what the word means; `QueryState`
lost its private witness with it.

Normalised away, both deliberate and both documented where they are done: the
`ERROR: `/`WARNING: ` prefix, which separates a message from ordinary output on
a terminal and has a panel of its own here, and the two `~` lines added to the
primary list by 20260906-235936.
