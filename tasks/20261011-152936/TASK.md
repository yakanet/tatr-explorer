# Write a task through the folder the dev server serves

- STATUS: CLOSED
- PRIORITY: 38
- TAGS: data,infra

The served folder (20261011-150846) is read-only at first. This adds the half
that writes, which is what editing (20261010-030543) needs from it: a task file
replaced whole, by `PUT`, as a capability of the served source. The controls
that use it, and the function that renders a `TASK.md` the way the CLI does,
belong to the editing task and are shared with the browser way of writing if it
is built too.

## A write that cannot lose an edit

A task file is replaced whole, and refused with a conflict when it changed on
disk since it was read: the source sends what it last read (its size and date,
or a hash), the server compares before writing and answers 409 otherwise. The
page then reads again and says so, rather than overwriting an editor's save.

## The one risk: any page can reach localhost

A route that writes files is reachable by every page the reader has open, not
only by this one. What stands in the way:

- writes only under `tasks/` of the named folder, no `..`, no symbolic link out;
- writes by `PUT`, which a foreign page cannot send without a preflight, and
  Vite's default CORS answers it for localhost origins only;
- the `Origin` checked on every write besides, against the dev server's own:
  the CORS default admits every localhost port, another dev server's included;
- Vite's `server.allowedHosts`, which refuses DNS rebinding, left at its
  default and in force before the plugin's routes (measured on Vite 8.2.2).

What the reading half leaves ready: `answer` takes a web `Request` and returns
a `Response`, so the `Origin` check is specced like any other answer rather
than buried in the middleware; and `diskPath` confines to `tasks/` alone and to
files that exist, which is what replacing a task file whole needs.

Done when a task file can be written through the dev server, a stale write is
refused, and a write from another origin is refused, each covered by a spec.

---

Done. The served source is `Writable`, a capability beside the others:
`write(path, text, expected)` replaces a file whole, and only over `expected`,
the text read before it was changed. The contract runs that rule over every
source that writes (the served one, plain and followed), and skips the others.

What differs from the plan above:

- A file that changed since is an answer, `changed`, rather than an error, as
  a file `read` cannot find is null: the page acts on it by reading again.
  Only a write that cannot be made at all throws.
- The dev server answers a stale version 412, HTTP's own answer to an
  `If-Match` that does not hold, and a write naming none 428.
- The version is a SHA-256 of the text as decoded (`tagOf`, shared by both
  halves), so a byte order mark the browser drops compares equal.
- The origin is checked once for every request to the routes that is not a
  read, against the address the request was sent to, which a spec runs the
  middleware on a real server to build. Measured besides: a preflight from
  another port of this machine is answered 405, so a browser would not even
  send that write.
- A file deleted since it was read answers `changed` too.

Left as they are, and why:

- Nothing shows it yet: the controls, and the function that renders a task
  file as the CLI does, belong to 20261010-030543.
- Comparing and writing are two steps, so a save landing between them, within a
  millisecond, would be overwritten. A lock would not stop an editor anyway,
  and the folder is one person's.
- Nothing is created or removed: a task file is replaced, which is all editing
  asks for.
