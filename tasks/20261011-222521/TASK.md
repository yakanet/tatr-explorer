# Describe a new tag in `tasks/tags`

- STATUS: OPEN
- PRIORITY: 54
- TAGS: ui,format,scope

The tags field of the editing sheet offers the repository's tags with their
descriptions. A tag typed there that no task uses and `tasks/tags` does not
describe is new, and nothing says what it means: the CLI never writes
`tasks/tags`, which only `tatr summary` reads, so a tag is described by hand or
not at all.

Where the source writes, a new tag in the sheet gets a description field beside
it. Save appends one line per tag described, in the format `src/tatr.c` parses:

    <tag> , <description>

`tasks/tags` is rewritten through `write`, against the text read just before,
or created through `create` (20261011-222520) when the repository has none. A
tag left without a description is not written, so a reader who does not want to
describe it has nothing to do. The lines go at the end, after a line feed when
the file lacks its last one, so the descriptions already there stay byte for
byte.

Done when the tags file read back describes the new tag, with every line that
was there unchanged.
