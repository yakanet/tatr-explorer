# Give each way a folder arrives its own module

- STATUS: CLOSED
- PRIORITY: 30
- TAGS: data

`sources/local/folder.ts` (301 lines) holds five subjects: what the browser
allows (`folderAccess`, `canDropFolder`), the three ways a folder is handed over
(`fromFileList` for a directory input, `fromDirectoryHandle` for a picker's or a
Chromium drop's handle, `fromDirectoryEntry` for the entry tree a drop gives
elsewhere), and what they share (`LocalFolder`, the filters, reading
`.git/HEAD`). A sixth sits in a component: `FolderPicker` works out whether a
drop gave a handle or an entry, where no spec can reach it.

The two walks are the subjects of their own: the handle's runs on promises,
the entry tree's on callbacks read a page at a time, and only the handle can
ever write (20261010-030543). So, under `sources/local/`:

- `folder.ts` keeps what every way shares (`LocalFolder`, the filters,
  `listFolder`, `readBranch`, `branchFromHead`, which the dev server reads from
  Node), with the directory input's flat list and `folderAccess`, too short to
  stand alone.
- `directory-handle.ts` and `directory-entry.ts` hold one walk each, named
  after the browser API they read. Writing will land in the handle's.
- `drop.ts` holds what a drop needs: `canDropFolder`, and reading the dropped
  items into the folder's way back, out of `FolderPicker`, with a spec.
- `source.ts` takes `WayBack` and `fromWayBack`, as the source keeps the way back
  to read the folder again.

`tql/query.ts` stays whole. It follows `src/query.c`, which holds the
tokenizer, the parser, the evaluator and the diagnostics in one file of the same
size; keeping that shape is what lets the two be read side by side.

Done when each walk is its own module, a drop is read in `drop.ts`,
`FolderPicker` no longer tells a handle from an entry, and the suite says the
same as before.

---

Done as planned, in four modules. `folder.ts` went from 301 lines to 106;
`directory-handle.ts` and `directory-entry.ts` hold one walk each, and now have
the same shape: the entry walk's helpers, nested in one 80-line function, became
module functions beside a `tasksEntryOf` that mirrors `tasksDirectoryOf`.
`drop.ts` reads the dropped items in `droppedFolder`, whose spec pins that each
item is asked for before the first await (a mutation that awaits first fails
it). `FolderPicker` opens a picked handle and a dropped folder through the same
`fromWayBack`, and imports nothing that knows a handle from an entry.

The specs follow the modules. `folder.spec.ts` builds its folders from a file
list rather than a handle, so a regression in the handle walk no longer fails
`listFolder` and `readBranch`. The split put two pairs of near-identical cases
side by side, one per walk; each pair became one case, so the suite runs 842
tests instead of 844, with every assertion kept.
