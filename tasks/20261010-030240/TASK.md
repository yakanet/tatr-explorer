# Show what is wrong with the backlog, as a view of its own

- STATUS: OPEN
- PRIORITY: 50
- TAGS: ui,format

`tatr ls` checks a query, never the tasks behind it. A backlog drifts in ways no
command reports: a folder skipped, a tag nobody declared, a status that is
neither, properties voided by a missing `#`. Upstream wants one of these as a
command: 20260308-171346, among its oldest open tasks, asks for "a command that
reports all the skipped weird folders and files found in the tasks/ folder".

A fifth entry in the nav, "Health", lists what the reading found. Each finding
has its count and a link to the tasks concerned, the filtered list or the task
itself:

- **Folders skipped.** Today a count in the header, with the reasons in a
  tooltip. Here, one line each, with its reason.
- **Tags used but not declared** in `tasks/tags`, and declared but unused. On
  tsoding/tatr: `foo` and `bar`.
- **Statuses that are neither `OPEN` nor `CLOSED`**, which count as open.
- **Titles without `#`**, whose properties the CLI then ignores.
- **Priorities left at a default**: 100, which `tatr new` writes, and none at
  all, which reads as 999999. On tsoding/tatr, 19 of 33 open tasks sit at 100.
  Whether that is a choice or an omission is the reader's call, so it is shown
  rather than flagged as an error.

Several `:scope` at once is not a finding: the format gives the tag no meaning,
and keeping one at a time is this repository's own convention.

Where a finding has a location, it is written as the CLI writes its own
diagnostics (`./tasks/<id>/TASK.md:1: ...`), so it reads the same as what the
terminal prints. Everything comes from the reading already in memory, so the
view costs no request. A clean backlog says so in one line rather than showing
empty sections.

To decide: its key (`5`), whether the header's "N folders skipped" links here,
and whether the overview shows a count of findings.
