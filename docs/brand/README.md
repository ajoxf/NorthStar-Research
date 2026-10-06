# The NordStar Pro wordmark

There is no logo image, and there never has been. The mark is typography, set in CSS in
`src/components/site-chrome.tsx`. That is why "send me the high-res logo" has no file to
answer it with — and also why the mark is already resolution-independent everywhere it
appears on the site.

## The specification

Everything a designer needs to set it at any size.

| | "NordStar" | "Pro" |
|---|---|---|
| Typeface | Satoshi | IBM Plex Mono |
| Fallback | Inter, then system sans | ui-monospace |
| Weight | 500 (medium) | 400 (regular) |
| Case | As written | Uppercase |
| Size | 1.0× | 0.565× |
| Letter-spacing | −0.025em | +0.22em |
| Colour on dark | `#FFFFFF` | `#D6FD3A` |
| Colour on light | `#111827` | `#D6FD3A` |

- The two words sit on a **shared baseline**, not centred against each other.
- The gap between them is **0.348em** of the "NordStar" size.
- At the header's own size those ratios are 23px / 13px with an 8px gap.

The accent `#D6FD3A` is the same lime used for buttons and eyebrows site-wide
(`--accent: 214 253 58` in `globals.css`). It does not change between grounds; only
"NordStar" does.

## Where Satoshi comes from

Fontshare, loaded at runtime from `https://api.fontshare.com`. It is not vendored into
this repository and not installed on any build machine, so anything rendering this mark
needs it fetched or installed separately. Inter is loaded alongside it as a deliberate
fallback rather than as a second choice nobody picked — see the note in
`src/app/layout.tsx`.

## The files here

`nordstar-pro-wordmark-dark.svg` and `nordstar-pro-wordmark-light.svg`.

Both carry **live text rather than outlined paths**. That keeps them editable and tiny,
and it means they render correctly only where the fonts are available. On a machine with
Satoshi installed they match the site exactly; with only Inter they render the designed
fallback; with neither, the letterforms will not match.

Before sending either anywhere it matters — a printer, an agency, a partner's site —
open it and check, or outline the text first (Illustrator: Type → Create Outlines;
Inkscape: Path → Object to Path; or `inkscape --export-text-to-path`).

## What is missing

- **No favicon.** The site has none at all, so browsers show a blank page icon in tabs,
  bookmarks and history.
- **No square or stacked mark.** The wordmark is horizontal and roughly 6:1, which is
  wrong for an avatar, an app icon, or anywhere square. A "NS" monogram or a stacked
  lock-up would be a separate piece of design work.
- **No outlined version.** See above.
