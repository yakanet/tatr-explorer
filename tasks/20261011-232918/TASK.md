# Drop any file into a description, not only an image

- STATUS: CLOSED
- PRIORITY: 52
- TAGS: ui

20261011-222522 lets an image be pasted or dropped into a description. A PDF
or a text file dropped there is left to the browser, which opens it in place of
the page, although a task's folder holds such files as readily: upstream's
carry `path.c` and `nob.h` beside their screenshots.

Any file pasted or dropped becomes a file of the task's folder, written by Save
as an image is, under the same naming. An image is linked as one,
`![name](./name)`; any other file as a link, `[name](./name)`, which the
reading sheet already resolves to the file wherever its source serves it.

While a file is dragged over the field, the field says it will take it, as
nothing on screen says so today.

Done when a PDF dropped into a description is in the task's folder after Save,
linked from the description, and listed among the task's attachments.

---

The editor hands any file to the `Sheet`, which keeps it as it kept images and
links it by its type: `![name](./name)` for an image, `[name](./name)` for the
rest. The links go on lines of their own when the cursor is in the middle of
one, so that no link is glued to the text around it.

While files are dragged over it the field is outlined, dashed, in the accent.
The links still go in at the cursor rather than where the file is let go,
which prism-code-editor's overlay would make costly to find.
