# Open a folder on this machine as a repository

- STATUS: CLOSED
- PRIORITY: 60
- TAGS: data,ui

A reader points this viewer at a public repository, which means the one thing it
cannot show is the repository someone is actually working in: private, or simply
not pushed yet. This project has felt it on itself: the site could not show the
tasks in this very folder until they were pushed, the dev server reading from
GitHub like everything else.

The browser can read a directory the reader chooses. `showDirectoryPicker()`
returns a handle, which can be walked again; `<input type="file"
webkitdirectory>` works everywhere and is enough for a single reading. Nothing
is uploaded and the browser arbitrates the permission, which is the promise the
README already makes.

**This belongs before 20260906-211255, not after it.** A local folder removes
four things that interface currently assumes (the URL, the budget, the branch
and the shareable address), so it is what says what shape the contract should
have. Implementing GitLab first would validate none of it, GitLab being
GitHub-shaped. The consequences for the contract are written where the contract
is, in 20260906-211255.

---

Feasibility, measured rather than argued.

**The interface is universal; the door is not.** `FileSystemDirectoryHandle`
with `entries()` and `getFile()` is what does the work, and it is reached two
ways with very different support (caniuse's own data, not a guess):

    File System Access (showDirectoryPicker)   Chrome/Edge yes, Firefox no, Safari no
    <input type="file" webkitdirectory>        everywhere

`navigator.storage.getDirectory()` is supported everywhere and is *not* this: it
is the origin's private sandbox, which cannot see a folder on the disk. It was
useful anyway: it hands back the same handle interface with no native dialog,
so the traversal could be exercised without a click.

**The two doors differ in one way that matters.** The picker's handle survives
IndexedDB (stored, read back, `isSameEntry` true for the same folder and false
for another), so a folder can be recognised later and a refresh is a genuine
reread. The input yields a flat `FileList` with `webkitRelativePath` and no
handle: one snapshot, and refreshing means picking again. Which is a smaller
difference than it looks, because the cache already works that way: read once,
reread only when asked.

**Cost, on a tree this repository's size** (38 files, 59 kB, through OPFS so a
real disk will be slower): 7.1 ms to walk it, 3.6 ms to read all 31 task files.
The GitHub path costs one rate-limited API call plus 31 CDN reads. This is not a
performance question.

**Three smaller answers.** A `blob:` URL from a file handle displays in an
`<img>`, so images and attachments have one. `showDirectoryPicker()` off a timer
answers `SecurityError: Must be handling a user gesture`, so it hangs off a
click. `.git/HEAD` reads fine, so the branch stays displayable: it is a file.

**And the code is readier than expected.** Outside the providers, only four
places assume a URL: the two reads in `load.ts`, `resolveAttachment`, and
`blobUrl` for the Source panel. The first three become `read(path)` and
`assetUrl(path)`; the fourth has no local equivalent at all, so that panel is
simply absent, which is the first honest sign that a source is not a forge.

---

Built as described, and the decisions worth keeping out of the code are these.

**Nothing is cached.** The cache exists to protect an API budget this source
does not spend, and a stored copy of a folder someone is editing would be wrong
before it was written. So a folder never appears in the homepage's list of
repositories already read; it is not one.

**A local reference is one URL segment**, `/local`, and the folder's name is
deliberately not in it: nobody else's machine could follow that address. The
name travels on the reading instead, which is why `LoadResult` carries a label.

**A reload is a dead end, and says so.** The browser takes the grant back, so
`/local` afterwards shows *No folder open* with the reason and the way out. The
picker's handle is kept for the tab so Refresh rereads; the input has no way
back, so its button reads `Reopen…` instead of lying.

**The homepage asks which door before using it.** Only the directory input makes
the browser count files, and saying so beforehand matters because a warning
nobody expected reads as a warning about the site. A browser with neither door
says so rather than offering a button that cannot work.

---

Merged and in production, and used on three browsers by three different doors
before this was closed:

- **Brave** picked the whole checkout through the directory input, which is what
  produced the file-count dialog and, with it, the acceptance of a `tasks/`
  folder.
- **Firefox** read `tsoding/tatr` from the disk on the deployed site: 64 tasks,
  41 closed, the months chart with its five empty months, the reference
  repository shown without a single network request.
- **Chrome** exposes the picker, and that is the one path still never taken by a
  human hand: it needs a click, and every real use so far landed on the input.
  It is exercised by the tests and by the same walk the origin-private file
  system drove during the study, which is not the same as having been used.

Firefox picking `tasks/` also showed the cost of that shortcut plainly: the
header reads `tasks`, because `webkitRelativePath` starts at the folder that was
picked and the parent's name is not knowable from it. Honest, and unhelpful.

What was left undone is recorded rather than carried here: dropping a folder is
20260907-143334, remembering one between visits is 20260907-150656, and that is
also what a local source would need to answer 20260907-040703.
