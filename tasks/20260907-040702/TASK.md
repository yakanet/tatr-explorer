# Show the query as the `tatr ls` command it is

- STATUS: CLOSED
- PRIORITY: 60
- TAGS: ui,tql

The whole claim of this viewer is that a query means the same thing here as in
the terminal, and the only place that claim is written down is the README. Put
it on screen: under the query bar, the command that produces what is shown.

    tatr ls ':bug and priority ge 100'

with a button to copy it. It teaches the CLI to a reader who arrived through the
web, and it lets someone check the claim instead of taking it on trust.

The interesting case is the one where it cannot be said. A query holding a `~`
term has no CLI equivalent (that is the point of 20260906-235936, the one
addition we allow), so the line has to admit it rather than print a command that
would not run. Something that names the term and says the search is ours, which
makes the divergence visible exactly where a reader might otherwise carry a
query to a terminal and watch it fail.

The closed toggle is part of the command too: `ls` hides closed tasks, `ls -c`
shows only those. Whatever the bar is showing, the echoed command has to be the
one that reproduces it.

---

Done, under the list's query bar: `$ tatr ls [-c] '<query>'` and a Copy button.
Checked on tsoding/tatr against the binary over the upstream checkout:
`:bug and priority ge 100` lists 2 tasks open and 6 closed, and no query 33,
on screen and in the terminal alike.

The query always goes in single quotes, as one argument. The CLI joins its
arguments with spaces, so the words would survive unquoted, but brackets would
not: zsh answers `tatr ls [:ui]` with "no matches found" before tatr sees it.

A `~` term and the `all` status get a sentence instead of a command, naming the
term (as typed, `~"two words"` included) and saying the search is the viewer's
own; for `all`, it adds that `tatr ls` lists the open tasks and `tatr ls -c` the
closed ones. A query in error gets nothing: its diagnostic is the thing to read.

Not on the board: it shows open and closed tasks at once, in columns, and no
command produces that. The list sorts as `tatr ls` does (priority, descending),
so neither `-a` nor `-id` is ever needed; tasks of equal priority may come in
another order, the tie-break by id being ours.

The Copy button writes the command; reading the clipboard back to check needs a
permission, so that last step was not checked.
