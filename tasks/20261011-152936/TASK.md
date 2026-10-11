# Write a task through the folder the dev server serves

- STATUS: OPEN
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
