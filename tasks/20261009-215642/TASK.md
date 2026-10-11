# Create a task as `tatr new` would write it

- STATUS: OPEN
- PRIORITY: 55
- TAGS: ui,scope

Where the source writes, a reader who finds a gap while reading can create the
task on the spot rather than in a terminal. The editing sheet of 20261011-204739
already holds every field a task has: a new task is that sheet opened empty,
whose Save creates the file instead of rewriting it.

Rewritten once 20261011-222520 let a source create a file. The ticket first had
the site prepare the command and the file, because it could not write.

What `tatr new` writes, read from `new_run` and `append_task_md_content` at
9b0d752, the commit the fixtures are recorded from:

    tasks/<id>/TASK.md

    # <title, `New Task` when none is given>

    - STATUS: OPEN
    - PRIORITY: <100 unless -p>
    - TAGS: <a,b (nothing after the colon when there are none)>

    No description.

The id is the UTC clock, `YYYYMMDD-HHMMSS`, and the CLI refuses one that already
exists: "You are probably creating tasks too fast, or your time is broken". The
site refuses it the same way, and the sheet stays open to be saved again a
second later. Upstream marks `append_task_md_content` as due to change
(TASK(20260913-063421)), so the template is pinned to that commit, not assumed.

- **Where**: a New task button in the header, beside Refresh, and the `n` key,
  only where the source writes. Both open `new` under the repository: the
  title, the description and the properties, as the editing sheet shows them,
  with the defaults of `tatr new`.
- **What Save writes**: the file `tatr new` writes for that title, priority and
  tags. A description typed replaces `No description.`, as `tatr new` followed
  by an edit would. The page then goes to the task.
- **Left out**: the `-s` suffix, which only upstream's own test task carries;
  and, on a source that only reads, the command to copy, which can come with
  the `tatr ls` command of 20260907-040702.

Done when the file created is byte for byte what `tatr new` writes for the same
title, priority and tags, which a differential test against the binary pins.
