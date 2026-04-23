# Buzzline

A BeeLine reader extension that doesn't suck ass.

Buzzline applies eye-guiding color gradients to text on every webpage so your
eye is pulled smoothly from the end of one line to the start of the next.

## Install (unpacked)

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select this project folder.
4. Pin the Buzzline icon, click it, and flip the switch on.

## How it works

The content script:

1. Walks every text node in the page (skipping `<script>`, `<code>`, inputs,
   and page chrome — `<nav>`, `<header>`, `<footer>`, `<aside>`, ARIA
   navigation/banner/complementary/search roles, and elements whose class or
   id contains junk tokens like `nav`, `sidebar`, `ad`, `banner`, `promo`,
   `comment`, `share`, `byline`, `pagination`, `cookie`, etc.).
2. Wraps each remaining character in a `<span data-bzln>` so each glyph is
   independently colorable.
3. Groups spans into visual lines using `getBoundingClientRect()` — a new line
   starts when the top coordinate jumps more than ~60% of a glyph's height or
   when we cross into a new block-level ancestor.
4. For line index `i`, interpolates the color of each span along the line
   between palette color `i mod N` and color `(i+1) mod N`. The end color of
   each line therefore matches the starting color of the next.
5. Reapplies on window resize (the line grouping changes when text reflows)
   and watches the DOM with a `MutationObserver` (childList + characterData)
   to handle dynamic content.

Colors are applied via a CSS custom property (`--bzln-c`) read by a rule in
`content.css`. That rule carries `!important` so it overrides site CSS; the
extension-declared stylesheet is not subject to page CSP.

Text is split on grapheme clusters via `Intl.Segmenter`, so emoji, flags,
and ZWJ sequences stay intact.

## Color schemes

Preset palettes cycle through four colors — each line starts in one and ends
in the next, so adjacent lines share a handoff color:

- **Classic** — black / blue / black / red
- **Dark mode** — light gray / light blue / light gray / peach
- **Ocean** — navy / teal / navy / seafoam
- **Bumblebee** — near-black / gold / near-black / brown
- **High contrast** — black / pure blue / black / pure red

## Known limitations

- Per-character spans on very long articles (10k+ characters) use measurable
  memory and add a small layout cost. Fine on normal pages; heavy pages may
  flash briefly while processing.
- Does not descend into iframes or shadow DOM in this release.
- Code blocks, inputs, and contenteditable regions are intentionally left
  alone.
- Vertical writing modes (`writing-mode: vertical-rl` etc.) are detected and
  skipped — those blocks stay their original color.
- Pages with very strict CSP (`style-src` excluding `'unsafe-inline'`) may
  block the inline custom-property assignment. The base rule still loads,
  so spans fall back to `inherit` and look normal (just uncolored).

## Files

```
manifest.json          Chrome MV3 manifest
src/content.js         Per-char span + gradient engine
src/content.css        Base CSS rule (reads --bzln-c custom property)
src/popup.html/css/js  Toolbar popup (toggle, scheme picker, live preview)
icons/                 Placeholder PNGs
scripts/gen_icons.py   Regenerates the icons (stdlib only)
```

## Dev notes

- No build step. Edit files, reload the extension in `chrome://extensions`,
  reload the page.
- State lives in `chrome.storage.sync` under the keys `enabled` and `scheme`.
- To regenerate icons: `python3 scripts/gen_icons.py`.

## Caveat

BeeLine Reader's gradient technique is covered by US Patent 9,026,907.
Personal/educational use is generally fine; consult a lawyer before
distributing publicly.
