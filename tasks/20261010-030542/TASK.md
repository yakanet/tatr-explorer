# Follow a local folder as it changes

- STATUS: CLOSED
- PRIORITY: 45
- TAGS: data

A local folder is read once. Edit a `TASK.md` in an editor and the board beside
it stays as it was until Refresh is pressed, and on Firefox there is not even a
Refresh: "Reopen…" brings back the file dialog and its "upload" confirmation.
For someone keeping their backlog with the CLI, the viewer is most useful
exactly there, open next to the editor, and that is where it is stale.

Built on 20261011-141340, which makes a new reading replace the one on screen
without unmounting the views, compares it with that one for a folder too, and
gives the state one source instance to hold a subscription. Without it,
following would blank the board on every change and announce nothing.

Reading again is free: no budget, no network, a few dozen files, read whole in a
few milliseconds. So every change is followed by a full reading, never by one
file patched into the last: a second path would have to agree with the first
forever, to save time nobody can measure. What following needs is a way back to
the folder, and there are two, not one:

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

With a way back, the reading can follow the folder, as an optional capability
of the source beside `refresh?()`: present only when the folder came with a way
back, absent on a forge, and the only thing the header and the state ask. How it
learns of a change is the local source's business:

- **On Chromium**, `FileSystemObserver` (Chrome and Edge 133 and later) reports
  a change under the handle. TypeScript's DOM library does not declare it yet.
- **Everywhere else**, the page regaining focus, which is the moment the reader
  comes back from the editor.

The badges then mean "since you last looked", which is what they are for.

Two things the subscription asks of what is there today:

- **The instance has to own its folder.** The local source still reads the
  folder, the handle and its `blob:` URLs from module variables, which
  `openFolder` swaps underneath it. A subscription held by one instance would
  watch whatever the module holds by then. `open()` takes them over instead,
  and the source gets a way to let go (unsubscribe, revoke its URLs) that the
  state calls when it drops it, on another reference or when the layout goes.
- **A reading re-renders every row.** The tasks are new objects each time, so
  every title is parsed again even when it did not change. Nothing for 79 tasks
  on a click; on every save, worth measuring before deciding whether a title
  cache earns its place.

To decide: whether following is always on or a toggle in the header (always on
is the lean: reading costs nothing, and the reason the cache never refreshes on
its own, the reader's budget, does not exist here), and how the header says it
(`following` rather than `read 2 minutes ago`).

---

Done, always on, with `following` in the header where the age was. Refresh
stays beside it, free and sometimes useful: two windows side by side never
hand the page the focus.

A folder dropped on Firefox keeps its entry tree now, so it gets Refresh and is
followed, on the focus. That path is covered by the specs over a stand-in entry
tree, on the strength of the measurement above; it was not run again in a real
Firefox. Handle or entry, one function walks it again (`fromWayBack`), which
the drop uses too.

Following is `follow?()` on the source, beside `refresh?()`, present only with a
way back to the folder. The local source watches `tasks/` with
`FileSystemObserver` where there is one, and the focus otherwise, or when the
folder refuses to be observed. Measured in Chrome on the origin's private file
system, which hands out the same handles: one `modified` record per save,
delivered 1.5 to 2 seconds after the write. The 150 ms left for a burst to
settle and the reading itself are lost in that.

Every change is followed, an editor's swap file included. What made that safe
is a rule beside the comparison (`comparedWith`, which the loader applies before
it writes the cache) rather than a filter here: a reading that moves no
metadata keeps the comparison standing instead of replacing it with one that
announces nothing. Followed folders take many such readings (the focus coming
back, a swap file, a save that only rewrote a title or prose, which the
comparison does not see), and each wiped the badges of the last real change.
It reaches a forge too: a Refresh that finds nothing now leaves the badges, the
cache storing the same comparison.

Not done as planned: the instance owning its folder. Every new folder arrives
through a navigation, which gives the state a new source, and the layout's
effect drops the old subscription through the function `follow` returns; for
reading, a stale instance corrects itself a moment later. Writing cannot rely
on that, which 20261010-030543 now states as its first step. Re-rendering every
row on each reading was not measured: at two seconds from save to screen, it is
not where the time goes.
