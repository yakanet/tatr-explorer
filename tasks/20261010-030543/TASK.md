# Edit the tasks of a local folder

- STATUS: OPEN
- PRIORITY: 35
- TAGS: data,ui

This viewer only reads. For a local folder opened with a handle, the browser can
also write, after asking the reader once for permission. That would let the
views act on the backlog instead of only showing it:

- **The board**: dragging a card to Done sets `STATUS: CLOSED`; to In progress
  adds the `scope` tag; back to Backlog removes it.
- **A task's page**: priority, tags and status edited in place.

This changes what the product is, from a viewer to an editor, and only for one
of its sources: a repository on a forge stays read-only. That boundary has to be
visible, or a reader will drag a card on GitHub's tasks and wonder why nothing
happens.

Writing follows the CLI, not a guess at it. `tatr untag` rewrites a whole file
through `render_task_md`: the title, every property in its original order
(unknown keys included) normalised to `- KEY: value`, then the body untouched.
A file the CLI wrote therefore comes back byte for byte, and one written by hand
is normalised the way the CLI would normalise it. That can be pinned with the
differential fixtures, by running `tatr untag` over the corpus and comparing.

A file changed on disk since it was read is not overwritten: the write compares
it first and asks the reader to read again. Following the folder as it changes
(20261010-030542) makes that rare, and shows the result of an edit made here
the same way as one made in an editor.

To decide: whether the permission is asked when the folder is opened or on the
first edit, and whether an edit can be undone from the page.
