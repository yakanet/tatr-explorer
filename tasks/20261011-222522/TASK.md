# Paste or drop an image into a description

- STATUS: OPEN
- PRIORITY: 53
- TAGS: ui,scope

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
