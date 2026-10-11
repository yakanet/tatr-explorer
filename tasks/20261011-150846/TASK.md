# Serve a folder from the dev server, to read and write over HTTP

- STATUS: OPEN
- PRIORITY: 40
- TAGS: infra,data

A local folder reaches the viewer through the browser alone: a picker, a drop
or a directory input, lost on every reload, and writable only on Chromium after
a permission prompt (20261010-030543). For whoever runs this repository's dev
server, there is a shorter way: the server is a Node process beside the folder
already. Started with a folder named, it could read it from the disk and serve
it to the page over HTTP, and the page could open on it directly:

    TATR_FOLDER=../tatr pnpm run dev

An environment variable, as `BASE_PATH` is for the build, because the CLI
refuses what it does not know: measured with Vite 8.2.2, `vite dev --folder
../tatr` stops on `CACError: Unknown option --folder`.

## Dev only, and said so

The site stays a folder of static files with no backend: this is a Vite plugin
whose `configureServer` adds a few routes to the dev server, and the build
never contains them. It is tooling for someone working on a tatr repository
next to this one, not a feature of the deployed site, and the page should only
offer it when the dev server announces a folder.

## What it serves

- **A listing**, in the shape a source already answers: the paths under
  `tasks/` and `.git/HEAD`, as the local walk keeps them.
- **The files**, read raw, which is also what an attachment's URL becomes.
- **Changes**, pushed when the folder moves, so the reading follows it
  (20261010-030542) in every browser, not only where `FileSystemObserver`
  exists. Watched by the plugin itself, apart from Vite's module watcher, which
  ignores `tasks/` on purpose and would otherwise turn a save into module
  handling.
- **Writes**, which make editing (20261010-030543) work in every browser and
  with no permission prompt: a task file replaced whole, after checking that it
  did not change on disk since it was read.

On the page, a source kind of its own, beside `github` and `local`, with the
capabilities the contract already names (`refresh?`, `follow?`) and the write
one the editing task adds. No view learns where its files come from. Unlike
`/local`, it survives a reload: the folder is the server's, not a grant the
browser takes back.

## The one risk: any page can reach localhost

A route that writes files is reachable by every page the reader has open, not
only by this one. What stands in the way:

- writes only under `tasks/` of the named folder, no `..`, no symbolic link out;
- writes by `PUT`, which a foreign page cannot send without a preflight, and
  Vite's default CORS answers it for localhost origins only;
- the `Origin` checked on every write besides, as the CORS rule is a browser's
  courtesy rather than the server's guarantee;
- Vite's `server.allowedHosts`, which refuses DNS rebinding, left at its
  default.

## To decide

- Whether editing (20261010-030543) is built on this rather than on the File
  System Access API. Here it works in every browser and is simpler to test; the
  browser way works on the deployed site, where this does not exist. Both may
  be wanted, and the editing task should not be started before choosing.
- The address: a marker like `/local` (say `/served`), and whether the home
  page opens on it by itself when the server announces a folder.
- Whether `vite preview` serves it too.
- Whether the pushes and the writes go over Vite's own dev channel (custom
  events, `server.ws.on` and `import.meta.hot.send`) rather than routes of
  their own. It exists in dev already, and since Vite 6.0.9 joining it takes a
  token a foreign page cannot read, which would retire most of the risk above;
  to check on 8.2.2 before relying on it. The price is pairing each write with
  its answer by hand, a conflict included. Reads stay plain requests.
