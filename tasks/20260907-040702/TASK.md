# Show the query as the `tatr ls` command it is

- STATUS: OPEN
- PRIORITY: 60
- TAGS: ui,tql

The whole claim of this viewer is that a query means the same thing here as in
the terminal, and the only place that claim is written down is the README. Put
it on screen: under the query bar, the command that produces what is shown.

    tatr ls ':bug and priority ge 100'

with a button to copy it. It teaches the CLI to a reader who arrived through the
web, and it lets someone check the claim instead of taking it on trust.

The interesting case is the one where it cannot be said. A query holding a `~`
term has no CLI equivalent — that is the point of 20260906-235936, the one
addition we allow — so the line has to admit it rather than print a command that
would not run. Something that names the term and says the search is ours, which
makes the divergence visible exactly where a reader might otherwise carry a
query to a terminal and watch it fail.

The closed toggle is part of the command too: `ls` hides closed tasks, `ls -c`
shows only those. Whatever the bar is showing, the echoed command has to be the
one that reproduces it.
