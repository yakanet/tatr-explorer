# Restyle the site on the Calm design system

- STATUS: CLOSED
- PRIORITY: 80
- TAGS: ui

The warm palette read as brown: a cream ground in the light theme, brown-black
surfaces in the dark one, an orange accent on both. Four rounds of mockups
settled on Calm: neutral grounds with a faint violet bias, one orchid accent,
four pastel tints that carry meaning (the stats and the tags), JetBrains Mono
for everything, rounded surfaces and pills.

Every token keeps the name the site already used, so the port is mostly a
change of values; the rest is shapes: a floating header, a segmented view
switch, cards, pill bars, a hero with its counts on tints.

Accessibility is part of the brief, not a pass at the end: every text colour at
4.5:1 on every ground it sits on, in both themes; chart marks and the focus
ring at 3:1; open and closed told apart by every colour-vision type; nothing
said by colour alone.

---

Done. `tokens.css` carries the Calm values for both themes, plus the tints, the
tag dots, `track`, radii, shadows and a `--focus-ring`; every view, the query
bar, the key help, the status panel and the folder picker are restyled on them.
The favicon and the logo take the orchid.

A tag's tint comes from its name alone (`tagHue`, FNV-1a modulo four), so a tag
keeps its colour from page to page and across repositories; the name is always
printed beside it.

Found on the way:

- The old light theme failed its own rule: `--muted` was 3.3:1 on the ground.
  The new one is 5.1:1 at worst.
- A closed node's number on the reference graph was white on mid grey, 3.7:1.
  No text colour reaches 4.5:1 on the old dark grey, so the dark
  `--series-closed` moved to `#85858f` (revalidated against the accent for
  colour-vision separation) and `--on-closed` sets the number.
- The dashboard's leaderboard card was called `.top`, which `.seg.top` on the
  month columns then inherited, padding and all: every column was 30px too
  tall. Renamed `.leaders`.
- At phone width the list's table pushed the page to 480px and the task page's
  fixed sidebar to 583px. The table now scrolls inside its card, and the task
  page stacks under 50rem. Checked at 400px on every view.

- The dashboard's generic `.panel` padding came after the hero's own, so the
  hero never had the room it asked for. The default now comes first.

The focus ring stays an outline, minus the `border-radius: 2px` that squared
every pill it surrounded: an outline follows the radius by itself. A
box-shadow ring was tried and dropped, because a card's own shadow outranked
it and the board's cards lost their ring in the light theme.

Cards sit `--card-gap` (24px) apart in every view, wider than their own
padding, after 16px read as cramped.

Left as they were: the board's column names keep their capitals, and the
README's screenshots still show the old palette.

---

Seen once the site was in use on a wider screen:

- Beside a long title, the dashboard's leaderboard wrapped an id at its
  hyphen rather than wrapping the title. `.id` no longer wraps anywhere.
- The query bar, a pill as wide as the header right under it, read as a second
  header. It now sits in each view's column, as wide as what it filters, and
  the views share their top padding so it does not move between them.
- The views sit at the middle of the header, over the column every view
  centres, and take a row of their own under 64rem.
