# Follow tatr up to bd29290

- STATUS: CLOSED
- PRIORITY: 55
- TAGS: infra,format

The recordings in `tests/fixtures/` come from tatr at 9b0d752. Upstream is now
at bd29290, 50 commits later, and `pnpm run fixtures` stops halfway through.
Recorded again by hand, 46 of the 1156 tests fail. Every query and every task
of the 94 still reads as the CLI reads it: neither the query language nor the
format changed meaning. What changed is the following.

- **`tatr untag` is deprecated** in favour of the update language,
  `tatr ls -update -<tag> <id>` (`-c` still selects the closed tasks). The
  script calls `untag` and stops there. The file written is the same: the tag
  is still removed out of order, the last tag moving into its place, which
  `untagged` already does. Upstream's 20261015-212300 in tatr's own tasks
  (priority 100) means to make it an ordered remove; `untagged` follows when
  it lands.
- **`tatr new` writes no body.** It now goes through `render_task_md`, and the
  file ends after `- TAGS:` with no blank line and no `No description.`.
  Creating a task here (`task-fields.ts`) still writes `No description.`, so
  the file differs from the CLI's.
- **The specs pin tatr's repository at 79 tasks.** It has 94 now, and every
  count, top priority, edge count and monthly figure taken from it moves:
  `board`, `graph`, `stats`, `load`, both conformance specs.
- **Four diagnostics crash the CLI.** A query that ends where a primary
  expression is expected (`priority and`, `[`, `:bug and`, `priority lt`)
  prints the help and dies of SIGBUS, and `[:bug` puts its caret under the `[`.
  `chop_next_query_token` leaves the token unset at the end of the input since
  ae8b5cf, so the caret is computed from a null pointer. What this site renders
  is still right: those four cases keep their recordings from 9b0d752. The
  script must refuse a run that a signal ended (`status === null`) instead of
  recording the crash as the CLI's answer.

Worth doing while here: the update language also has `+<tag>`, `open` and
`close`, so adding a tag, opening and closing a task can be pinned against the
CLI the way removing a tag is, instead of only by our own specs.

To do: move the script to `ls -update`, record again, align `tatr new`, update
the counts, and keep the four diagnostics.

---

Done as described, with one change to the plan for the diagnostics. `[:bug`
does not crash: it answers with its caret under the `[`, from the same unset
token, and no check on the exit status can see that. So a case the CLI gets
wrong is marked in `tatr-query-errors.json` itself, with `kept` holding the
reason, and the script keeps its last answer; the four such cases are
`priority and`, `priority lt`, `[` and `[:bug`. A crash on a case not marked
stops the script. Dropping `kept` once upstream is fixed records them again.

`ls -update -<tag>` writes exactly what `untag` wrote: `corpus-untag.json` came
out unchanged. `tatr new` now writes no body, and neither does a task created
here. The specs now read the repository's size from the fixture, and keep
literal only what the code computes from it (columns, tags, months, clusters),
so the next refresh moves fewer numbers. `takes the most urgent first` moved to
tasks of its own, since no open task upstream is above 100 any more and the
real repository no longer tells the order apart from ties.

Not done: pinning `+<tag>`, `open` and `close` against the CLI.
