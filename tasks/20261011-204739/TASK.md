# Switch a task's page between reading and editing

- STATUS: OPEN
- PRIORITY: 55
- TAGS: ui

A task's page edits its status, priority and tags in place since
20261010-030543, but not its title or its description, the Markdown under the
properties, which is most of what a task says.

The page becomes two sheets of one task:

- **Reading**, as today on every source: the title, the rendered description
  with its journal, the properties as text.
- **Editing**, reached by an Edit button and left by Save or Cancel: the title
  and the description as text, the status, priority and tags as fields.

The button is there only where `repo.canEdit(task)` holds, as every edit
control is: a repository on a forge, a folder on Firefox, or a file without its
`#` show the reading sheet and nothing else. The property fields leave the
reading sheet for the editing one, so that reading looks the same on every
source and editing happens in one place.

What 20261010-030543 left ready: `write(path, text, expected)` replaces a file
whole and refuses a stale one, `TaskFile` already holds the title, the
properties and the body apart, and Undo writes back any text. A save is one
edit like the others: applied to the file as it is on disk, rendered as the CLI
would, followed by a reading.

The board's drag stays as it is: moving a card is one gesture, not a sheet.

To decide:

- Whether a save sends the fields the reader changed or the whole sheet. A
  property changed on disk while the sheet was open would be overwritten by the
  second, silently.
- What a followed change does to an open sheet: the folder is read again at
  every save made in an editor, and that reading must not wipe a draft. The
  lean: keep the draft, and say above it that the file changed since it was
  opened, with a way to see that version.
- Which light Markdown editor library holds the description, rather than a bare
  `<textarea>`. Three conditions:
  - It edits the source and keeps the text as typed, byte for byte. A WYSIWYG
    editor (Milkdown, TipTap) rebuilds the Markdown from its own model,
    rewriting the lists, emphasis and spacing the author chose, which a file
    must not suffer when one word changed.
  - It is light, weighed against the bundle before it is chosen.
  - It loads only when the editing sheet opens, so a reader never downloads it.

  Candidates to measure: TinyMDE, OverType (a textarea under a highlighted
  layer), and a minimal CodeMirror 6 with its Markdown language.
- Whether the description is previewed while typed (markdown-it is there), side
  by side or on a toggle.
- Whether leaving the page with unsaved changes asks first.
