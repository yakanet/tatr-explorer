# Create a file where the source writes

- STATUS: CLOSED
- PRIORITY: 56
- TAGS: data

`Writable` replaces a file the source holds, and nothing else: the dev server
answers 404 for a path with no file, and the folder on Chromium looks a file up
without creating it. Three things wait on creating one: a new task, its folder
and its `TASK.md` (20261009-215642); the description of a new tag, in a
`tasks/tags` the repository may not have yet (20261011-222521); and an image
pasted into a description (20261011-222522).

`write(path, text, expected)` takes `null` for `expected`: no file, which it
then creates, with the folders missing on the way. It is the same comparison as
for a file that changed since it was read, so a file there already answers
`changed`, and nothing is ever replaced unread. The contents become text or a
`Blob`, for an image. A repository with no `tasks/tags` needs no case of its
own: what was read is null, and that is what the write expects.

- **The dev server**: a `PUT` with `If-None-Match: *`, HTTP's own way to say
  "only if absent", answered 412 when a file is there. The path is confined as a
  write's is: under `tasks/`, never through `..` or a symbolic link, and from
  this server's origin only.
- **A folder on Chromium**: the handles are asked for with `{ create: true }`,
  once the file is known to be absent. The permission is the one `write` asks
  for, on the same first gesture.

Done when the source contract creates a file on every source that writes,
refuses to create one over a file that exists, and creates nothing outside
`tasks/`.

---

A first version added a `create` beside `write`, answering `created` or
`exists`. It was a second compare-and-swap whose expected state is "no file",
which `read` already says with null, so it became that value of `expected`.

The dev server takes a `PUT` with `If-None-Match: *` as a creation: 201, 412
when something is there, 403 for a path it may not create. It makes the missing
folders one at a time and checks each with `lstat`, so a symbolic link to a
folder is never entered, even one pointing elsewhere in `tasks/`. The file is
opened with `wx`, which fails on anything already there, a link included.

The folder on Chromium walks down with `{ create: true }`; the browser itself
refuses a name such as `..`, so nothing is created outside `tasks/`. A file
created joins the source's files at once, so it is listed and read before the
next walk.

The contract creates text and bytes on the three subjects that write, refuses
to create over a file, and refuses three paths outside `tasks/`.
