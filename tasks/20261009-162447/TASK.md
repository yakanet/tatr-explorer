# A task whose id is no real date is listed by `tatr ls` and skipped here

- STATUS: OPEN
- PRIORITY: 90
- TAGS: format,scope

`is_valid_huid` in `src/huid.c` checks the shape of a folder name and nothing
else: eight digits, a dash, six digits, an optional suffix. `src/task.c` loads
every folder that passes. A folder named `20260231-000000` is therefore a task
to the CLI, and `tatr ls` lists it — measured with the binary built from
9b0d752 over a scratch `tasks/` holding exactly that.

Here, `load.ts` and `readTask` both go through `parseHuid`, which also reads
the digits as an instant and refuses one that does not exist. The same folder
is skipped as "Folder name is not a task id", so a repository the CLI reads in
full shows one task fewer, and says something false about why. `isValidHuid` is
the port of `is_valid_huid`, shape only; the loader deliberately does not use
it yet.

Found while porting the `<huid>` query primary (20261009-161453), which had
the same split and now uses `isValidHuid`.

Not a one-line fix, which is why it is a task: `Task.created` is a `Date`, and
the dashboard's months, the stats and the sort all lean on it. Something has to
decide what such a task's creation date is — none, most likely, with every
consumer of `created` made to cope — rather than inventing one. A fixture for
it cannot come from tsoding/tatr, which has no such folder; it would be a small
`tasks/` of our own, run through the binary the same way.
