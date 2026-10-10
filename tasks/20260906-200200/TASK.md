# Port the query language to TypeScript

- STATUS: CLOSED
- PRIORITY: 110
- TAGS: tql

`tatr ls` queries should work unchanged in the site, so the language needs a
faithful port rather than an approximation.

---

Done, in `src/lib/tql.ts`. Ported from `src/query.c`, not from the README, which
omits three things: `.tag` is still accepted for backward compatibility, `not`
binds to a *primary* so `not :a and :b` means `[not :a] and :b`, and evaluation
is typed (`:a lt 5` is a type error rather than a silent coercion).

Validated by differential testing: `tests/fixtures/tql-cli-cases.json` holds 34
real invocations of the compiled `tatr ls` binary over its own tasks folder, and
the suite asserts this library selects exactly the same ids. 69 tests in total.

The reference CLI builds on macOS despite 20260825-170729 saying otherwise.
