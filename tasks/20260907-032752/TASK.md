# The caret accuses the `~` instead of naming what is missing

- STATUS: CLOSED
- PRIORITY: 90
- TAGS: tql,ui

`~"windows :bug` reports

    ~"windows :bug
    ^
    Unterminated quote

and both halves of that are wrong for the reader. The caret sits under the `~`,
the one character in the line that is right, so it reads as an accusation of the
sigil rather than a place to type. And the message names a state instead of an
action: nothing tells you a `"` is what closes it.

The language already had this exact mistake, in brackets, and the CLI answers it
well: `[:bug` gives

    [:bug
         ^
    ERROR: Expected `]`.

Caret past the end of the line, where the closer belongs, and the message is the
character to type. The three `~` diagnostics are ours to write, so they should
be written that way, the whole rule of this divergence being that an addition
copies the CLI wherever the CLI has an answer.

See 20260907-011002, which is the same family: the unterminated quote is not an
exotic input, it is what every search looks like halfway through typing.

Leading spaces are what makes it plain, and they hid a second bug: the state
compiles `text.trim()` while the bar printed `text`, so the source line kept the
spaces the caret's columns had been counted without. Seven spaces in front of a
query put the caret seven columns short of what it meant, which is the report
in the screenshot, and the reason the caret looked like it was accusing the `~`.

---

The three now read as the CLI's own:

- `~"windows :bug` → caret at the end of the line, `` Expected `"`. `` (the
  words used for an unclosed bracket), and no help block, because naming the
  missing character is the whole of the advice.
- `~` → caret one past the sigil, `Search text is expected here.`, above the
  primary list, which already spells `~<word>` and `~"<words>"`, so the two
  forms are on screen next to the caret asking for one.
- `~"  "` → `empty search`, lower case and unpunctuated, matching the
  `empty tag` the CLI prints for a bare `:`. The caret stays on the token here,
  nothing being missing from it.

The caret positions are asserted through `formatDiagnostic`, on the rendered
three lines rather than on a span number, since the column is the part that was
wrong. Verified on screen for the first two.

The desync is closed at the source rather than at the call: `QueryState` now
hands out `source`, the string it compiled, and the bar renders a diagnostic
against that. One string reaches both the parser and the panel, so the two
cannot drift apart again. That is easier to get right than to remember a
`.trim()` at every call site, and there were three other places already
trimming by hand.

Attached is the report that started it, `unterminated-quote.png`.
