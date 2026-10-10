# Remember the folder between visits

- STATUS: CLOSED
- PRIORITY: 50
- TAGS: data,ui

A reload takes the folder back, so `/local` shows *No folder open* and the
reader picks the same folder again. Where the File System Access API exists,
that second pick is avoidable: a directory handle is structured-clonable, so it
survives IndexedDB, and the folder it points at can be recognised on the way
back.

Checked while studying 20260907-122228, not assumed: the handle stores and reads
back, `isSameEntry` answers true for the same folder and false for another, and
`queryPermission({ mode: 'read' })` responds.

What that buys is one click instead of a file dialog. After a reload the panel
would offer *Reopen `tatr-site`* (naming the folder, because it knows it), and
`requestPermission` on that click brings it back. The permission itself is never
stored: the browser re-asks, and a stored handle without a grant reads nothing.
That is worth saying on screen, since remembering a folder sounds like keeping
its contents, and it is not.

The homepage could then list remembered folders beside the repositories already
read, which is the same idea one storey up, with the difference that a card for
a folder is a request for permission rather than a link.

Where it does not apply: the directory input hands over files and no handle, so
Firefox and Safari, and Brave with the API turned off, keep picking again. This
is an improvement for the door that already has the better story, which is worth
knowing before it is mistaken for the fix to the other one.

Two things to handle rather than discover:

- **A folder that moved or went away.** The handle then throws on use, and the
  right answer is to forget it rather than to explain it.
- **Which folder.** More than one can be remembered, so the identity of a local
  source stops being "the one open" and becomes a choice, which is the first
  time a local folder needs a key of its own, and `repoKey` has no shape for
  one.

It would also put something beside the folder in storage, which is what the
comparison from 20260907-040703 needs to work for a local source: it is the
cache that carries the previous reading, and a folder has no cache. A snapshot
kept next to the handle would close that gap, and is not this task.

---

Abandoned rather than built, and the reason is in the mechanism rather than in
the effort: what gets remembered is a *handle*, and only two of the three doors
hand one over. The picker gives one on Chromium alone; a drop gives one on
Chromium and a legacy `FileSystemEntry` everywhere else, which has no clone
steps defined and so cannot be stored at all; the directory input gives a flat
list of files, where there is nothing to keep.

So the offer would exist on Chrome and Edge, and be absent on Firefox, on
Safari, and on Brave, which ships the API turned off. Not a fallback, an
absence. And even where it worked it would be one click rather than none, since
the permission never survives a reload; only the handle does.

A door that opens for some readers and not others is worth less here than the
one sentence it would save, so the feature is dropped rather than shipped
half-wide. Nothing was built for it, so nothing is removed: the handle is still
kept in memory for Refresh, which is a different promise and holds for the
length of a visit.

The measurements are left above so nobody has to take them again to reach the
same answer.
