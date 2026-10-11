# Give each way a folder arrives its own module

- STATUS: OPEN
- PRIORITY: 30
- TAGS: data

`sources/local/folder.ts` (298 lines) holds four subjects: what the browser
allows (`folderAccess`, `canDropFolder`), the three ways a folder is handed over
(`fromFileList` for a directory input, `fromDirectoryHandle` for a picker's or a
Chromium drop's handle, `fromDirectoryEntry` for the entry tree a drop gives
elsewhere), the filters on what is kept, and reading `.git/HEAD`. Each way has
its own browser API and its own walk, and only the handle can ever write
(20261010-030543): one module per way, beside a `folder.ts` keeping what they
share (`LocalFolder`, the filters, the branch), lets a reader open the one they
need, and gives writing a module to land in.

`tql/query.ts` stays whole. It follows `src/query.c`, which holds the
tokenizer, the parser, the evaluator and the diagnostics in one file of the same
size; keeping that shape is what lets the two be read side by side.

Done when each way is its own module, `folder.ts` holds only what they share,
and the suite says the same as before.
