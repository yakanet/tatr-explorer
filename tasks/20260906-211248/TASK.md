# Self-host JetBrains Mono

- STATUS: OPEN
- PRIORITY: 70
- TAGS: infra

JetBrains Mono is the site's only face — `--font-sans` and `--font-display` both
point at `--font-mono` — and it loads from Google Fonts at 400, 600, 700 and 800,
every weight the CSS asks for and none spare. That is a request to a third party
on every visit, from a site whose README promises no analytics and no server,
and a render dependency on a CDN we do not control.

Self-host it from Fontsource: the latin file only, one `@font-face` written by
hand, `font-display: swap`, a `preload`, and `app.html` left with neither the
stylesheet nor its two preconnects. Done when a visit sends nothing to
`fonts.googleapis.com` or `fonts.gstatic.com`.

The task was first written for IBM Plex and Bricolage Grotesque, which the Calm
restyle (20261009-181700) replaced with this one family.

Measured, from the 5.3.0 tarballs and from the file Google serves to Chrome:

    @fontsource-variable/jetbrains-mono   40.4 kB  latin, wght 100-800, one file
    @fontsource/jetbrains-mono            86.2 kB  latin, four static files
    Google Fonts, today                   31.3 kB  latin, wght 400-800, one file

**The variable file, and it is 9 kB heavier than today.** Google already sends a
variable font — the 24 `@font-face` rules of its stylesheet point at six files,
one per subset, shared by the four weights — and it cuts the axis to the range
requested: the same 394 glyphs and 229 code points, but `wght` 400-800 instead
of 100-800, and no `HVAR` or `prep` table. Two ways to go, to be decided before
the code is written: take the package's file and pay the 9 kB, or instance the
axis to 400-800 once with `fontTools.varLib.instancer` and ship that file
instead, which turns a dependency into a generated file and its regeneration
into a manual step.

**The family is renamed.** The variable package declares
`'JetBrains Mono Variable'`, so `--font-mono` has to name it. A mistake is
silent: the stack falls through to `ui-monospace` and nothing errors.

**There is no per-subset CSS.** `wght.css` declares all six subsets — cyrillic,
cyrillic-ext, greek, latin, latin-ext, vietnamese — and importing it would ship
every one of them in the build, `unicode-range` only sparing the reader the
download. Hence the `@font-face` by hand, pointing at the latin file of the
installed package, where `font-display` and the preload can be read.

**Some glyphs the interface draws are in neither subset.** `←`, `→` and `⇄` on
the reference cards and `⏎` in the query bar's completion hint sit outside the
latin range of both Google and Fontsource, so they come from the fallback face
today and will keep doing so. Drawing them in JetBrains Mono means subsetting
the upstream font ourselves, after checking that it has all four — a separate
decision, not part of this task.

**No italic, as today.** A task body's `*emphasis*` is slanted by the browser;
a real italic would be a second file of 43 kB.

**The licence travels with the file.** JetBrains Mono is under the SIL Open Font
License, which asks that its notice go with the font. Shipping it from this
repository puts that notice in `NOTICE`, beside the fixtures' — the file that
exists for exactly this, the repository being MIT with stated exceptions.
