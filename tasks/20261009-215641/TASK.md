# Search the text of tasks, not only their titles

- STATUS: OPEN
- PRIORITY: 50
- TAGS: tql,data

`~` searches titles. In a terminal the rest of a task is one `grep` away, and a
reader in a browser has nothing to reach for, which is the argument that brought
`~` in (20260906-235936).

The text is mostly in hand already. A reading from the network fetches every
`TASK.md` and keeps the descriptions in memory; only IndexedDB drops them, being
over half the bytes. So a body search costs nothing after a fresh reading, and
after one served from the cache it means reading every file again: 79 for
tsoding/tatr, 37 kB in all, from `raw.githubusercontent.com`, which does not
count against the API quota. A folder on this machine costs nothing either way.

Constraints, whatever the design:

- the files are read only once a query asks for body text, with progress shown,
  never on page load;
- what is read is held in memory for the session and never written to IndexedDB.

To decide:

- **The syntax.** Widening `~` to bodies would change what every `?q=~…` link
  already shared returns, which points to a term of its own. Either way a query
  using it cannot move to the CLI, and the command 20260907-040702 will echo
  under the bar has to say so.
- **What a match shows.** A hit in the body is invisible in a row that shows the
  title; a line of context under it would say why the task is there.
- **Large repositories.** Thousands of tasks after a cache hit mean thousands of
  requests to raw. The loader's pool bounds concurrency; whether stating the
  cost before spending it is enough, or a cap is needed too, is for a
  measurement to say.

Done when a body term matches exactly the tasks whose `TASK.md` holds every one
of its words, case ignored — what `grep -il` finds for each word, intersected —
its cost is visible before it is spent, and the README argues it as the second
addition to the language.
