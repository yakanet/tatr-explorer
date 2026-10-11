# Describe a new tag in `tasks/tags`

- STATUS: CLOSED
- PRIORITY: 54
- TAGS: ui,format

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

---

A tag of the draft is new when no task carries it and `tasks/tags` does not
describe it (`newTags`); each gets a "what it means" field under the tags, on a
task's page and on the new task's page alike.

Save writes the task's file first, then `describedTagsFile` appends the lines
to the text read just before, through `write` with that text expected, or
with null where the repository has none. The task's file comes first because
that is the write the reader is asked to allow; it is written even unchanged
when there are tags to describe, so that the question comes before anything
else. A description that cannot be written does not undo the save: the notice
says it was saved, then why the tags were not described.

Undo still takes back the task's file alone; a description written stays. Both
pages now hold a `Sheet`, its draft and these descriptions, which the images of
20261011-222522 are to join.
