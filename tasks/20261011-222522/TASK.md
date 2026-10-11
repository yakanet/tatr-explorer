# Paste or drop an image into a description

- STATUS: CLOSED
- PRIORITY: 53
- TAGS: ui

A task's images sit in its folder beside its `TASK.md`, and its description
links them by a relative path, as upstream's do: `![image.png](./image.png)`.
The editor's toolbar can insert such a link, but the file still has to be copied
into the folder by hand.

Where the source writes, an image pasted or dropped into the description's
editor becomes a file of the task's folder, and the link to it is inserted at
the cursor. The file is written by Save, with the rest of the sheet, through
`create` (20261011-222520): Cancel writes nothing, so no image is left behind
that no task links. Until then, Preview shows the image from memory.

- **Its name**: the dropped file's, reduced to letters, digits, `.`, `-` and
  `_`, so that the link needs no escaping; a pasted screenshot, which has no
  name, gets `pasted-<clock>.png`. A name the folder or the sheet holds already
  gets `-2`, `-3` before its extension.
- **A new task**: its images go into its folder once `TASK.md` has created it.
- **A save tried again**: an image written by a save that failed further on is
  not written twice.

Done when an image pasted into a description is in the task's folder after
Save, linked from the description, and shown by the reading sheet.

---

The editor hands an image pasted or dropped to the `Sheet`, which keeps it
until Save under a name `attachmentName` frees, and inserts its link at the
cursor through `insertText`, the command the toolbar uses, so Undo in the
field takes it back. Names lose their accents, not their letters:
`Mon schéma (v2).png` becomes `Mon-schema-v2.png`. A file named `image.png`,
the name a browser gives a pasted screenshot, is named after the clock; any
other keeps its own, pasted or dropped alike. Preview shows the image from a
`blob:` URL, released when the sheet closes.

Save writes the images after the task's file, through the extras that now
describe any file a save writes besides it: created, never replacing one that
is there, or rewritten from what it holds, as `tasks/tags` is. An image whose
link was deleted from the description is not written. For a new task the
extras get its id once `TASK.md` has made its folder.

A save whose extras fail closes the sheet like any other, its notice naming
each file left unwritten and why, so nothing is ever tried twice; the
"tried again" case of the ticket does not arise. Undo still takes back the
task's file alone.
