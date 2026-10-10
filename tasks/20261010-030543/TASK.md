# Edit the tasks of a local folder

- STATUS: OPEN
- PRIORITY: 35
- TAGS: data,ui

This viewer only reads. For a local folder, some browsers can also write, after
asking the reader for permission. That would let the views act on the backlog
instead of only showing it:

- **The board**: dragging a card to Done sets `STATUS: CLOSED`; to In progress
  adds the `scope` tag; back to Backlog removes it.
- **A task's page**: priority, tags and status edited in place.

This changes what the product is, from a viewer to an editor, and only for one
of its sources: a repository on a forge stays read-only. That boundary has to be
visible, or a reader will drag a card on GitHub's tasks and wonder why nothing
happens.

## Where it can work

Only where the folder came with a handle and the handle can be written: the
picker, or a drop, on Chromium (Chrome, Edge; Brave ships the API turned off).
Firefox has no picker, and what it gives for a drop is the legacy entry tree,
which reads and can be walked again (20261010-030542) but cannot write. Its
`createWritable()`, supported since 111, exists for the origin's private file
system only, never for the reader's folder. Safari is in the same place. The
directory input is a snapshot everywhere.

## Feature detection, never a crash

Whether editing is offered is decided by what the opened folder and the browser
actually expose (a handle, `createWritable`, `requestPermission`), never by the
browser's name. Where any of it is missing, the views show no edit control at
all rather than one that fails.

Where it is offered, every failure leaves the viewer as it was, read-only and
still correct, with one sentence saying why: the permission refused (and not
asked again on every gesture), the file changed on disk since it was read (the
write compares first and asks the reader to read again), the write itself
failing. No error reaches the page as an exception.

## Kept apart

Three pieces that do not know about each other:

- **Writing the file is the format's business**, a pure function beside the
  parser, with no browser in it. It follows the CLI rather than a guess at it:
  `tatr untag` rewrites a whole file through `render_task_md`, the title, every
  property in its original order (unknown keys included) normalised to
  `- KEY: value`, then the body untouched. A file the CLI wrote should come back
  byte for byte, which is for the differential fixtures to show rather than for
  this task to assume: `tatr untag` run over the corpus tasks carrying a tag,
  and its files compared with ours.
- **Being able to write is the source's business**, an optional capability on
  the source interface the way `refresh?()` already is. The local source has it
  only when the detection above passes; a forge never has it. The detection
  lives in that one place.
- **The views only ask whether the capability is there.** No component tests
  the browser, and removing the feature would mean removing the capability and
  the controls, nothing in between.

Following the folder as it changes (20261010-030542) shows the result of an
edit made here the same way as one made in an editor, and makes a file changed
under the reader's feet rare.

To decide: whether the permission is asked when the folder is opened or on the
first edit, and whether an edit can be undone from the page.
