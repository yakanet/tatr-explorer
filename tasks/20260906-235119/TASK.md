# List a task's other files as attachments

- STATUS: CLOSED
- PRIORITY: 90
- TAGS: ui,data

A task folder may hold more than its `TASK.md`. On tsoding/tatr seven files do:
four screenshots, `nob.h`, `path.c` and a `.gitignore`, with `20260321-181305`
carrying four of them on its own. Show them on the task, so what a task carries
is visible without reading for it.

The listing already knows. `load.ts` keeps only entries matching
`tasks/<id>/TASK.md` and drops the rest, though the whole tree was downloaded in
the same request. So this costs **no extra request at all**, only the entries we
are currently throwing away. `TreeEntry` even carries `size`, so a file can be
listed with its weight without fetching it.

Six of those seven files are already referenced from their `TASK.md`, and
rendering handles them: `link_open` and `image` both rewrite a relative path to
the repository's raw CDN, so a referenced screenshot displays and a referenced
`path.c` is a working link. The gap is narrower than it looks (an unreferenced
file is invisible), but a list is worth having even for referenced ones: it says
what a task carries without reading a long body to find out.

To decide when building it:

- **What to hide.** The only unreferenced file upstream is a `.gitignore`, which
  is tooling rather than an attachment. Dotfiles are the obvious cut; anything
  more is guessing.
- **What the cache keeps.** Only metadata is stored, so the file names have to
  join it. Seven names for a 64-task repository is nothing, but the shape should
  hold for a repository where every task carries a screenshot.
- **Whether to mark the referenced ones**, so the list does not read as a
  duplicate of what is already shown in the body.

Attachment paths must go through `resolveAttachment`, which refuses a path
climbing out of `tasks/` and pins the host (see 20260906-211220 for why that
rule exists).

---

Done, as a `Files` panel beside `Properties`. On `20260321-181305` it lists
`2026-05-11-074919_1423x794_scrot.png` at 115 kB, `nob.h` at 126 kB and
`path.c` at 5.9 kB: sizes straight from the listing, so nothing extra is
fetched to weigh a file.

Free, as expected: `load.ts` was filtering the tree down to `TASK.md` and
dropping the rest of a response it had already paid for. `collectAttachments`
keeps what was being thrown away, and the names ride along in the cache because
`withoutDescriptions` only ever removed the body.

The three questions the task left open:

- **Dotfiles are out**, at any depth: `tasks/x/.git/config` is not an
  attachment either. That leaves nothing hidden to report, since the only
  unreferenced file upstream was the `.gitignore`.
- **No "shown above" marker.** Six of the seven files upstream are already
  linked from their body, so the marker would be the rule rather than the
  exception and would inform nothing. The panel says what the folder holds; the
  body shows what the author chose to show. Two jobs, neither needing to point
  at the other.
- **Nested files keep their shape**: `shots/before.png` is listed as written,
  which is also the relative path `resolveAttachment` needs.

Links go through `resolveAttachment`, so a path climbing out of `tasks/` is
refused and renders inert rather than pointing anywhere. They open in a new tab,
being raw files rather than pages of this site.

One thing to know when testing: the cache holds metadata written before this
existed, so an already-loaded repository shows no files until Refresh.
