# Prepare a new task as `tatr new` would write it

- STATUS: OPEN
- PRIORITY: 55
- TAGS: ui

The site never writes to a repository, and should not start. But it can do the
part of `tatr new` that is not writing: name the folder and fill in the file, so
a reader who finds a gap while reading has it ready to run or to paste.

What `tatr new` produces, read from `new_run` and `append_task_md_content` at
9b0d752, the commit the fixtures are recorded from:

    tasks/<id>/TASK.md

    # <title>

    - STATUS: OPEN
    - PRIORITY: <100 unless -p>
    - TAGS: <a,b — nothing after the colon when there are none>

    No description.

The id is the UTC clock, `YYYYMMDD-HHMMSS`, followed by `-<suffix>` when `-s` is
given, and the CLI refuses one that already exists, blaming the clock. Upstream
marks `append_task_md_content` as due to change (TASK(20260913-063421)), so the
template is pinned to that commit, not assumed.

From one small form — title, priority, tags offered from `tasks/tags` with their
descriptions, an optional suffix — up to two outputs:

- **The command**, `tatr new -p 80 -t ui Title words`, to run where the
  repository is checked out. It is quoted for a POSIX shell with the same code as
  the `tatr ls` command of 20260907-040702, which is best built first.
- **The folder name and the file**, to paste — if an id is shown at all, since
  one generated now is stale by the time anyone pastes it. The command does not
  have that problem.

To decide as well: where the form lives — a key, a button in the header.

Done when the file prepared is byte for byte what `tatr new` writes for the same
arguments at that commit, which a differential test against the binary pins.
