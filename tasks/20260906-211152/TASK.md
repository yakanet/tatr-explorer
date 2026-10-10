# Parse the tatr format faithfully

- STATUS: CLOSED
- PRIORITY: 110
- TAGS: format

The parser must reproduce `src/md.c`, not the README, which simplifies.

- The title line must start with `#`. If it does not, the reference parser
  abandons property parsing entirely and emits an error title. Reproduce that.
- Properties are consecutive `- KEY: value` lines where KEY is alphanumeric
  only. They land in a hash table, so arbitrary keys are legal and should be
  displayed, not just STATUS/PRIORITY/TAGS.
- Tags are separated by commas and/or whitespace, interchangeably.
- Anything that is not exactly `CLOSED` counts as open.
- A higher PRIORITY number is more urgent. The README's `priority lt 50`
  example reads the other way round; it is wrong.

Trap worth a test: `- TAGS:` with an empty value exists in real repositories.
A `\s*` after the colon swallows the newline and captures the first line of the
description as the tag list. The separator must be `[ \t]*`.

---

Done, in `src/lib/tatr/`: `huid.ts`, `task-md.ts`, `tags-file.ts` and `task.ts`.

Ported from `src/md.c`, `src/task.c` and `src/huid.c`. Three things the README
does not say, all of them now covered by tests:

- The default priority is **999999**, not 100: "unset priority is high so you
  don't forget to set it", so an unset task sorts to the top instead of hiding in
  the middle.
- An unparsable priority is 0 and `12abc` is 12, because the reference uses
  `atoi`.
- The `tasks/tags` separator is any run of commas *and* whitespace, which is why
  the upstream line `tql,, Tatr Query Language` parses cleanly.

Validated the same way as the query language: `tests/fixtures/tatr-ls-output.json`
holds what the compiled binary printed for all 64 tasks, and the suite re-derives
every field it shows (title, status, priority, tags) and compares. 226 tests in
total across the project.
