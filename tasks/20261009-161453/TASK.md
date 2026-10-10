# Accept a task id as a query, as `tatr ls` now does

- STATUS: CLOSED
- PRIORITY: 100
- TAGS: tql

Upstream added a primary to TQL (tsoding/tatr 9a15133, `OP_ID`): a valid HUID
selects the task with that id.

    tatr ls -c 20260828-211200

Here the same query fails with "Unexpected start of a primary expression". That
breaks the one promise the port makes (every query `tatr ls` accepts behaves
identically here), and it is a change upstream, not an addition of ours, so
there is nothing to argue: it has to be ported.

What `src/query.c` does, checked against the binary built from 9b0d752:

- A token that passes `is_valid_huid` compiles to `OP_ID`. `isValidHuid` in
  `src/lib/tatr/huid.ts` already accepts exactly the same set.
- It matches when the task id is *equal* to the token. No prefix matching:
  `20260830-000838` does not select `20260830-000838-rexim`, only the full
  extended id does.
- It is tested before the integer parse. A HUID never parses as a whole integer,
  so the order changes nothing, but keep it the same as the C anyway.
- A token that resembles an id but is not valid (`20260828-21120`) is still an
  unknown primary, with the usual help list.
- An id that names no task is not an error, just an empty result.

Work:

- In `src/lib/tql/query.ts`: add the `<huid>` primary to the parser and the
  evaluator, add it to the grammar comment, and append
  `<huid>         - valid id of a task` to `PRIMARY_HELP` after `<number>`,
  where the C prints it.
- Add a row to the README's query table.

The conformance cases have to come from the new binary, and `../tatr` is now at
9b0d752. Its `tasks/` folder holds 79 tasks where
`tests/fixtures/tsoding-tatr.json` holds 64, and some of the old ones changed
since (20260828-211200 is now closed). Regenerate every fixture from that one
commit rather than mix two snapshots: the snapshot, the `ls` output, the graph
edges, the CLI cases and the query errors. The errors fixture moves anyway,
because the help list the C prints gained a line. The `toHaveLength(64)`
assertion in the conformance test moves with them.

Cases worth adding, each hitting something distinct:

- a short id, with and without `-c`;
- the extended id `20260830-000838-rexim`, and its short prefix matching
  nothing;
- an id inside an expression: `not 20260828-211200`,
  `20260828-211200 or tagged`;
- an id naming no task;
- an invalid id-like token, in the errors fixture.

Builds on 20260906-200200 (the port) and 20260907-002307 (the errors fixture).
Once it lands, 20260907-040702 can echo such a query as a command like any
other.

---

Done. `<huid>` is a primary in `query.ts`, tested between `priority` and the
integer as in the C, and `<huid>         - valid id of a task` closes the help
list as it does there. The README's query table has a row for it.

One claim above was wrong. `isValidHuid` did not accept the same set as
`is_valid_huid`: it read the digits as a date and refused `20260231-000000`,
which the C takes as an id: `tatr ls 99999999-999999` answers "No tasks were
found", not an error. It checks the shape alone now, as its name promised, and
the query uses it. The one caller that wanted the date, the loader, calls
`parseHuid` itself, and that is a divergence of its own: 20261009-162447.

The fixtures were regenerated together from 9b0d752, by a script checked first
against d927bf4, where it rebuilt all six existing files byte for byte. 79
tasks, 36 arrows, 50 CLI cases, 15 error cases. The counts the specs measure on
the real repository moved with them, each re-derived from the CLI's output
rather than from ours.

The new corpus caught a divergence the old one could not show. Upstream's
20260912-102943 names 20260828-211200 in its title and nowhere else, and
`tatr graph` draws that arrow: the C scans the whole `TASK.md`, while
`extractReferences` was handed the description only, under a comment saying
the reference implementation "scans the whole file". It reads the whole file
now, title and properties included.
