# A task whose id is no real date is listed by `tatr ls` and skipped here

- STATUS: CLOSED
- PRIORITY: 90
- TAGS: format

`is_valid_huid` in `src/huid.c` checks the shape of a folder name and nothing
else: eight digits, a dash, six digits, an optional suffix. `src/task.c` loads
every folder that passes. A folder named `20260231-000000` is therefore a task
to the CLI, and `tatr ls` lists it (measured with the binary built from
9b0d752 over a scratch `tasks/` holding exactly that).

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
decide what such a task's creation date is (none, most likely, with every
consumer of `created` made to cope) rather than inventing one. A fixture for
it cannot come from tsoding/tatr, which has no such folder; it would be a small
`tasks/` of our own, run through the binary the same way.

---

Measured before deciding. Over five folders (`20260101-120000`,
`20260231-000000`, `20261399-999999`, `00000000-000000`, and a closed
`20260231-000000-x`), the binary built from 9b0d752 lists every one: `tatr ls`
sorts them by priority and then by id as plain strings, `tatr ls -id` puts month
13 first, `summary` counts them, `find` and `ref` work on them. The CLI writes
the clock into an id when it makes one and never reads it back; no command shows
a date at all.

So the date was ours to lose. `parseHuid` keeps any id of the right shape and
gives it `created: null` when its digits form no instant, and the loader asks
`isValidHuid`, which makes "Folder name is not a task id" true again. The five
folders now load as the CLI loads them, in the same order, which `load.spec.ts`
pins with the recorded output, inline rather than as a fixture, being five ids
from folders of our own.

Two places read `created`, sorting never did. The month chart leaves such a
task out without saying so, a decision taken on the reader's word: it is counted
everywhere else, and the chart is about when. The task's own page drops its
"created" line rather than invent one.

A repository cached before this change still lists such a folder as skipped
until the reader refreshes it, and the refresh then reports the task as new,
once. None is known to hold one.

Not tried on screen: no repository at hand holds such a folder, and a local one
goes through the browser's dialog. The loader, the chart and the parser are
covered, each test proved to fail without its change.
