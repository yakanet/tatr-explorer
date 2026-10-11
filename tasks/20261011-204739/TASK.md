# Switch a task's page between reading and editing

- STATUS: CLOSED
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

---

Done. A task's page reads the same on every source, its properties as text,
and Edit, offered where `repo.canEdit(task)` holds, turns it into a sheet:
the title, the description, and the status, priority and tags as fields.
Save and Cancel leave it. The board's drag is unchanged.

The decisions:

- **The editor** is prism-code-editor with its Markdown grammar, which
  highlights a copy of the text under a transparent `<textarea>`, and GitHub's
  `markdown-toolbar-element` for the toolbar: 8.7 kB gzip in the built chunk
  with the toolbar's icons, plus 1 kB of CSS, loaded only when a sheet opens. Measured beside it, also
  gzip: TinyMDE 18.6 kB (`contenteditable`, and it pulls core-js), OverType
  40.5 kB, CodeMirror 6 with its Markdown language 173 kB (it brings HTML, CSS
  and JavaScript along). `markdown-text-editor` was ruled out for depending on
  marked and DOMPurify. The textarea holds the text, so what is saved is what
  was typed: a tricky text (trailing spaces, a tab, a non-breaking space,
  runs of blank lines, raw HTML) came back byte for byte, and the toolbar's
  bold left the rest untouched. The editor ignores the selection for a moment
  after each input, when the toolbar selects what it formatted, and its
  textarea then hid that text; its own `setSelection`, run once the toolbar is
  done, makes it read the selection again. The selection takes the accent at
  35%, under text that keeps a contrast of about 9:1.
- **Save writes only the fields changed**, each over the file as it is on
  disk (`withFields` in `task-fields.ts`). A field changed on disk to
  something else than the draft refuses the whole save, with the fields named,
  and the draft stays. A file with CRLF line endings keeps them in the title
  and the body, which a textarea turns into line feeds; the property lines
  are written with line feeds, as `render_task_md` writes them.
- **Preview** is a Write / Preview switch in the editor's own bar, the
  site's segmented control in a quieter variant, rendering the description with
  `Journal`, the component the reading sheet uses, so it looks as the page
  will.
- **The toolbar's icons** are Lucide's, resolved at build time by a Vite
  plugin (`src/lib/icons.server.ts`): an import of
  `virtual:icons/lucide:bold.svg` becomes that icon's `viewBox` and body, so
  only the icons used reach the bundle, here the editor's chunk, and the page
  asks the Iconify API nothing. It ports a plugin from another project, with
  each set read once from its own `@iconify-json` package rather than every
  set from `@iconify/json`, and `iconToSVG` applying the offsets and flips the
  original ignored.
- **The tags field** offers the repository's tags as it is typed, with their
  description from `tasks/tags`, through a `<datalist>`. A tag removed there
  is removed as `tatr untag` removes it: `tagged` and `untagged` in
  `task-file.ts` serve both the sheet and the edits.
- **A followed change keeps the draft**, and a line above Save says the task
  changed on disk since editing began.
- **Leaving with changes unsaved asks first**: `confirm` for a navigation in
  the site, the browser's own prompt for a reload or a closed tab.

`edit` and `undo` now resolve to whether the file holds the change, which is
how the sheet knows to close. An edit that refuses the file, a field changed on
both sides or a title that lost its `#`, throws `EditRefused`, which reads the
folder again, as a write that found its file changed does.

Checked in Chrome on the served folder: a description typed and made bold
from the toolbar, Preview, a priority changed on disk while editing (the line
appeared, the draft stayed), a save refused for a priority changed on both
sides, then a save that wrote the description and kept the priority from disk,
compared with git; Cancel and a confirmed navigation wrote nothing, and a
declined one kept the sheet. The confirmation dialogs were stubbed, as a real
one stops the browser being driven.

Not done: pasting or dropping an image into the description. An image in the
task's folder can be referenced as `![](shot.png)` and shows on Preview, but
adding one means creating a file, which `Writable` does not do: it replaces a
file that exists.
