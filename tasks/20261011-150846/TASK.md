# Serve a folder from the dev server, and open on it

- STATUS: CLOSED
- PRIORITY: 40
- TAGS: infra,data

A local folder reaches the viewer through the browser alone: a picker, a drop
or a directory input, lost on every reload. For whoever runs this repository's
dev server, there is a shorter way: the server is a Node process beside the
folder already. Started with a folder named, it reads it from the disk, serves
it to the page over HTTP, and the page opens on it:

    TATR_FOLDER=../tatr pnpm run dev

An environment variable, as `BASE_PATH` is for the build, because the CLI
refuses what it does not know: measured with Vite 8.2.2, `vite dev --folder
../tatr` stops on `CACError: Unknown option --folder`.

Reading and following only. Writing through it is 20261011-152936.

## A Vite plugin, not SvelteKit routes

Both can serve it; measured on Vite 8.2.2 and SvelteKit 3.0.1.

- **SvelteKit routes** (`+server.ts`) work in dev, and the static build accepts
  them without a word: a probe endpoint with `prerender = false` built cleanly
  and was simply absent from `build/`. But they belong to the app's route tree,
  compiled into the build's server output even though nothing ships them, and
  pushing changes would need either a stream from an endpoint or a plugin
  anyway. Two mechanisms, and the app knowing about a development tool.
- **A Vite plugin** installs its routes only in the dev server
  (`configureServer` runs nowhere else), and one place holds the routes, the
  watch on the folder and the redirect to it. Its middlewares come after Vite's
  own CORS and host validation (`configureServer` hooks run once those are
  installed), so they inherit both. And Vite's dev channel is already there for
  pushes: the client joins it with a token a foreign page cannot read
  (`hasValidToken`, checked whenever a request carries an `Origin`).

The server half lives beside the page half, in the source's own folder, as a
`.server.ts` module: SvelteKit refuses to let browser code import one, and the
specs and the type check already cover `src/`.

## Nothing of it in a build

The server half never installs a route outside the dev server. The page half,
the source kind, is registered behind a constant Vite substitutes at compile
time (`define`), set only for a dev server started with `TATR_FOLDER`. Measured
with the build's own bundler: a probe pushed behind such a constant, and
another behind `import.meta.env.DEV`, were both absent from `build/`, while a
control pushed unguarded into the same array was there. So a production build
ships none of it, and a dev server without the variable does not offer
`/served` either (its module is still loaded in dev, which bundles nothing; a
dynamic import would avoid even that, at the price of an asynchronous
registry).

## What it serves

Started with `TATR_FOLDER`, the dev server answers `/` with a redirect to
`/served`, where the page opens on that folder. `vite preview` does not serve
it: nobody needs a production build reading a folder.

- **A listing**, by `GET`, in the shape a source already answers: the paths
  under `tasks/`, as the local walk keeps them, the folder that is itself a
  `tasks/` folder accepted the same way, and the branch `.git/HEAD` names.
- **The files**, by `GET`, read raw, which is also what an attachment's URL
  becomes. Only those paths: nothing outside `tasks/`, no `..`, no symbolic
  link out of it.
- **Changes**, pushed over Vite's dev channel (`server.ws.send` to
  `import.meta.hot.on`) when the folder moves, so the reading follows it
  (20261010-030542) in every browser. Watched by the plugin itself, apart from
  Vite's module watcher, which ignores `tasks/` on purpose.

On the page, a source kind of its own, beside `github` and `local`, with the
capabilities the contract already names (`refresh?`, `follow?`). No view learns
where its files come from. Unlike `/local`, it survives a reload: the folder is
the server's, not a grant the browser takes back.

Done when `TATR_FOLDER=… pnpm run dev` opens on `/served`, the reading follows
the folder as it is edited, a path outside it is refused, and a build contains
none of it.

---

Done. `TATR_FOLDER=… pnpm run dev` prints the address beside Vite's own, and `/`
redirects to `/served`, which reads the folder from the disk. Checked in Chrome
on a copy of tsoding/tatr: a priority changed and a task added on the disk
showed up with their badges and no action on the page, the rows staying mounted;
a full load of `/served/task/…` works, which `/local` cannot do; an attachment
arrives as `image/png`, sandboxed.

What is refused, each with a spec over real folders: anything outside `tasks/`
(the branch travels in the listing, so not even `.git/HEAD` is served), `..`
(encoded slashes included), a malformed encoding, and a symbolic link out of
`tasks/`, even one pointing elsewhere in the same folder.
The listing leaves links out and comes sorted, the disk promising no order. A
foreign origin gets an answer without the CORS header, so its page cannot read
it. Files go out with `Content-Security-Policy: sandbox`: an SVG or an HTML
page opened in a tab of its own would otherwise run its scripts as the dev
server's origin, the one its routes trust, which matters once writes exist.

A build contains none of it, checked on `build/`: neither the routes, the event
nor the source's messages. And `/served` is no address where no folder is
served, a build included, so it ends on a plain 404 rather than on a source
nobody claims. A dev server without the variable prints nothing more and
answers nothing more.

The constant is read in one module, `src/lib/served.ts`, which a spec stands in
for to cover a dev server serving a folder: `/served` as an address, the source
registered, every reference still claimed once. The bundler folds it away
through that import as well, checked on `build/` again.

Left as found: `describeRef`'s sentence for the served folder is still in a
build, dead text in a module every page needs. The source's two halves are
specced together through the server's answer, a `Request` in and a `Response`
out, with no HTTP between them; the dev channel itself is covered by the run in
Chrome only.
