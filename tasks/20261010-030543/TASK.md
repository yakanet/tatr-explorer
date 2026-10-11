# Edit the tasks of a folder, where it can be written

- STATUS: OPEN
- PRIORITY: 35
- TAGS: data,ui

This viewer only reads. Where a source can write, the views could act on the
backlog instead of only showing it:

- **The board**: dragging a card to Done sets `STATUS: CLOSED`; to In progress
  adds the `scope` tag; back to Backlog removes it.
- **A task's page**: priority, tags and status edited in place.

This changes what the product is, from a viewer to an editor, and only for the
sources that can write: a repository on a forge stays read-only. That boundary
has to be visible, or a reader will drag a card on GitHub's tasks and wonder why
nothing happens.

Rewritten after 20261011-163029, which made writing one capability among others.

## Writing is a capability

A source that can replace a file implements `Writable`, beside `Rereadable` and
the others. The views ask `isWritable` and show no edit control at all where it
is false, rather than one that fails: no component tests the browser, and
removing the feature means removing the capability and the controls, nothing in
between.

When a write answers `changed`, the page reads again and says so. An edit is
applied to the file as read just before writing, not to the reading on screen,
which may be minutes old.

The folder the dev server serves has it already (20261011-152936): every
browser, no permission prompt, but only in development. What remains is **a
folder picked or dropped on Chromium**, through the File System Access API: the
handle's `createWritable()`, after `requestPermission`. Firefox has no picker,
and what it gives for a drop is the legacy entry tree, which reads and can be
walked again but cannot write; its `createWritable()` exists for the origin's
private file system only. Safari is in the same place, and the directory input
is a snapshot everywhere. Whether a folder can write is decided by what it
exposes (a handle, `createWritable`, `requestPermission`), never by the
browser's name, and its source is `Writable` only then.

## Rendering a task file is the format's business

A pure function beside the parser, with no browser in it, shared by every
source that writes. It follows the CLI rather than a guess at it: `tatr untag` rewrites a
whole file through `render_task_md`, the title, every property in its original
order (unknown keys included) normalised to `- KEY: value`, then the body
untouched. A file the CLI wrote should come back byte for byte, which is for the
differential fixtures to show rather than for this task to assume: `tatr untag`
run over the corpus tasks carrying a tag, and its files compared with ours.

## Failures

Every failure leaves the viewer as it was, read-only and still correct, with one
sentence saying why: the permission refused (and not asked again on every
gesture), the file changed on disk since it was read, the write itself failing.
No error reaches the page as an exception.

Following the folder as it changes (20261010-030542) shows the result of an edit
made here the same way as one made in an editor.

To decide: for the browser way, whether the permission is asked when the folder
is opened or on the first edit; for both, whether an edit can be undone from the
page.
