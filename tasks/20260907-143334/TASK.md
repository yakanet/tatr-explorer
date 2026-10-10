# Drop a folder on the page to open it

- STATUS: CLOSED
- PRIORITY: 50
- TAGS: ui,data

Possible, and it may be the best door of the three rather than a third
convenience. Two APIs carry it, and the support numbers are the argument:

    DataTransferItem.getAsFileSystemHandle   Chrome 86, Firefox no, Safari no
    DataTransferItem.webkitGetAsEntry        Chrome 13, Firefox 50, Safari 11.1

Both were checked present in Chrome; the versions are MDN's compatibility data
rather than a guess.

**On Chromium it is nearly free.** `getAsFileSystemHandle()` returns a
`FileSystemDirectoryHandle` (exactly what `fromDirectoryHandle` already walks,
from 20260907-122228), so a dropped folder arrives as the *good* kind of source,
with a handle, which means Refresh rereads it. No new reading code at all.

**Everywhere else it still works**, through `webkitGetAsEntry()` and the legacy
entry tree. That needs a walker of its own, and it holds the trap that API is
known for: `createReader().readEntries()` is callback-based and returns a page
at a time, so it has to be called again until it answers with an empty array;
reading it once looks like it worked and silently loses the rest. Like the
directory input, it yields no handle, so such a folder is a snapshot.

**And it may avoid the question the input asks.** A drop is itself the gesture,
so there should be no *"import xxxx files?"* count dialog, the thing that made
20260907-122228 accept a picked `tasks/` folder in the first place. Worth
confirming before it is claimed on screen: if it holds, dropping becomes the
path to recommend for a browser without the picker.

Where: the homepage's local panel is the obvious target, and the *No folder
open* panel is the second, since that is where a reader lands after a reload.

One trap to write down before it is met: `event.dataTransfer.items` is emptied
when the drop event's turn ends, so the handles or entries have to be collected
synchronously in the handler and only then awaited. Doing the natural thing
(awaiting the first one, then reading the list) finds an empty list.

Also worth handling out loud: something that is not a folder. A dropped file has
no tree to read, and saying so beats doing nothing.

---

Done, and both doors landed as the study said they would: a dropped folder is
read by `fromDirectoryHandle` on Chromium (nothing new, it is the same handle
the picker returns, so a drop there is a source that Refresh can reread) and by
`fromDirectoryEntry` everywhere else, which mirrors the handle walk against a
callback API: ask for `tasks/` and `.git/HEAD` by name rather than descend a
checkout.

The paging trap is pinned rather than trusted. A reader that answers two entries
at a time and ends with an empty array is what the fake in the spec does, and a
five-task folder read through it fails on a `readEntries` called once (checked
by making that mistake on purpose). Reading once loses everything past the first
page and looks like it worked.

**And the silent failure was real, found in the browser rather than reasoned
about.** Dropping a plain file showed nothing at all: no folder, no message.
`getAsFileSystemHandle()` resolves to `undefined` for an item that is not a
file (the spec says `null`), so a guard written as `!== null` let it through
and the `in` test threw inside a promise nobody was catching. Falsy covers both,
and the whole collection is wrapped: a rejection there is exactly what silence
looks like.

**The target is the window, and it is only shown while it is wanted.** It began
as a dashed box around the button: 252 by 53 pixels, a sixth of the panel, and
decoration for the whole of the time nobody is dragging anything. Answering the
drag events on the window instead makes the target 130 times larger, costs no
pixels at rest, and a veil appears over the page while a folder is overhead to
say what will happen. Dropping anywhere works, which was checked by dropping at
the far bottom of the page.

That also fixed a defect the small box had rather than only enlarging it:
without a `dragover` answered at the window, a folder dropped *beside* the box
made the browser navigate to it and leave the page entirely.

Three details make it behave. The drag is only acknowledged when
`dataTransfer.types` holds `Files`, so dragging a text selection or a link lights
nothing up. Enter and leave are counted rather than flagged, because `dragleave`
fires on the way into every child; leaving the window is the one `dragleave`
with no `relatedTarget`, and that resets the count instead of decrementing it.
And the veil takes no pointer events, or it would answer `dragleave` for the
element under it and blink.

Not claimed on screen: that a drop skips the file-count question. It should,
the drop being the gesture itself, but a synthetic drag cannot show it and this
has not been dropped on by a hand yet. The homepage offers dropping as the
alternative *to* that count without promising what the browser will ask.
