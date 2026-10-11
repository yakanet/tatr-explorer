# Split the largest pages into the blocks they show

- STATUS: OPEN
- PRIORITY: 65
- TAGS: ui

The overview page is 574 lines, 341 of them styles; the task page 512 (268);
the graph page 511 (227). Each shows several blocks (the overview: its
summary, three charts, the `tatr ls` list) whose markup and styles sit far
apart in one file. A component per block, carrying its own markup and styles,
leaves the page as the assembly of what it shows.

Done when no page under `src/routes/` reads as several blocks at once, the
screens look the same, and the suite says the same as before.
