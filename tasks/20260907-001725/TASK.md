# Move the query language into src/lib/tql/

- STATUS: CLOSED
- PRIORITY: 60
- TAGS: tql,infra

`src/lib/tatr/` holds the format (`huid.ts`, `task-md.ts`, `task.ts`,
`tags-file.ts`, `stats.ts`, `graph.ts`), each beside its spec. The query
language does not follow that shape: `tql.ts`, `tql-complete.ts`,
`tql.spec.ts`, `tql-complete.spec.ts` and `tql.conformance.spec.ts` sit loose at
the top of `src/lib/`, named by prefix instead of by folder.

Give it `src/lib/tql/` alongside `src/lib/tatr/`, and the prefixes stop earning
their keep:

    tql.ts                    ->  tql/index.ts  (or tql/query.ts)
    tql-complete.ts           ->  tql/complete.ts
    tql.spec.ts               ->  tql/query.spec.ts
    tql-complete.spec.ts      ->  tql/complete.spec.ts
    tql.conformance.spec.ts   ->  tql/conformance.spec.ts

Two things to keep an eye on. Imports are `#lib/...` with mandatory file
extensions under this SvelteKit generation, so every caller has to be updated by
hand and `pnpm run check` is what proves none was missed. And the fixture paths
in the conformance spec are relative: `../../../tests/fixtures/...` gains a
level.

Worth doing when nothing else is open in those files: it is a rename with no
behaviour attached, so it is cheap to do and annoying to do twice.

---

Done, with `git mv` so the history follows:

    tql.ts                  ->  tql/query.ts
    tql-complete.ts         ->  tql/complete.ts
    tql.spec.ts             ->  tql/query.spec.ts
    tql-complete.spec.ts    ->  tql/complete.spec.ts
    tql.conformance.spec.ts ->  tql/conformance.spec.ts
    tql.diagnostics.spec.ts ->  tql/diagnostics.spec.ts

Seven imports and three fixture paths, the latter gaining a level. `pnpm run
check` is what proved none was missed, as expected: mandatory file extensions
mean a stale path is an error rather than a resolution to something else.

**No `tql/index.ts`**, deliberately, and this is the part worth recording:
`src/lib/tatr/index.ts` exists, is imported by nothing, and re-exports four of
that folder's eight modules; `stats`, `graph`, `board` and `attachments` are
missing from it. A barrel nobody imports is not a convention to copy; it is a
trap for whoever imports it next and finds half the package. Callers name the
module they want, which is what every caller already did.

The tasks closed before this one name the old paths in their journal entries.
Left as written: an entry says what was true when it was written, and editing
one to match a later rename would be tidying the record rather than keeping it.
