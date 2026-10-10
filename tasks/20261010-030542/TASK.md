# Follow a local folder as it changes

- STATUS: OPEN
- PRIORITY: 45
- TAGS: data

A local folder is read once. Edit a `TASK.md` in an editor and the board beside
it stays as it was until Refresh is pressed. For someone keeping their backlog
with the CLI, the viewer is most useful exactly there, open next to the editor,
and that is where it is stale.

Reading again is free: no budget, no network, a few dozen files. So the reading
can follow the folder:

- **When the browser can tell**, with `FileSystemObserver` where it exists, a
  change to a task file triggers a reading of that file alone.
- **Otherwise**, a new reading when the page regains focus, which is the moment
  the reader comes back from the editor, and possibly on a slow interval while
  it is visible. `File.lastModified` lets a reading skip the files that did not
  change.

Only a folder opened with a handle can be read again: the picker on Chromium, a
drop on Chromium. The directory input hands over files and no way back to them,
so it keeps today's "Reopen…".

A reading that follows the folder feeds what a refresh already feeds: the badges
saying what is new, closed or moved since the previous reading. They would then
mean "since you last looked", which is what they are for.

To decide: whether following is always on for a handle or a toggle in the
header, and how the header says it (`following` rather than `read 2 minutes
ago`).
