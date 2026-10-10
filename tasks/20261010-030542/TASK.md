# Follow a local folder as it changes

- STATUS: OPEN
- PRIORITY: 45
- TAGS: data

A local folder is read once. Edit a `TASK.md` in an editor and the board beside
it stays as it was until Refresh is pressed, and on Firefox there is not even a
Refresh: "Reopen…" brings back the file dialog and its "upload" confirmation.
For someone keeping their backlog with the CLI, the viewer is most useful
exactly there, open next to the editor, and that is where it is stale.

Reading again is free: no budget, no network, a few dozen files. What it needs
is a way back to the folder, and there are two, not one:

- **A handle**, from the picker or a drop on Chromium. It is what Refresh uses
  today.
- **The entry tree of a drop**, on Firefox. Measured on Firefox on 2026-10-10,
  with a page that walks the dropped entry again on demand: a task folder added
  on disk showed up, a title changed in an editor was read with its new text,
  and a folder deleted was gone. No dialog at any point. The loader keeps no such
  entry today and treats a drop on Firefox as a snapshot, so the first step
  stands alone: Refresh, instead of "Reopen…", for a folder dropped on Firefox.
  Safari has the same entry API and was not measured.

The directory input remains a snapshot everywhere: it hands over files and no
way back to the folder, so it keeps "Reopen…".

With a way back, the reading can follow the folder:

- **On Chromium**, `FileSystemObserver` (Chrome and Edge 133 and later) reports
  a change to a task file, and only that file is read again. Firefox and Safari
  do not have it.
- **Everywhere else**, a new reading when the page regains focus, which is the
  moment the reader comes back from the editor. `File.lastModified` lets that
  reading skip the files that did not change.

A reading that follows the folder feeds what a refresh already feeds: the badges
saying what is new, closed or moved since the previous reading. They would then
mean "since you last looked", which is what they are for.

To decide: whether following is always on or a toggle in the header, and how
the header says it (`following` rather than `read 2 minutes ago`).
