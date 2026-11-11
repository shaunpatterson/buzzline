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

1. Finds the page's main prose container (like a reader mode: the smallest
   element holding most of the non-link text, so file tables, link lists and
   sidebars are left alone; pages with no prose body are not coloured), then
   walks every text node in it (skipping `<script>`, `<code>`, inputs,
   and page chrome — `<nav>`, `<header>`, `<footer>`, `<aside>`, ARIA
   navigation/banner/complementary/search roles, and elements whose class or
   id contains junk tokens like `nav`, `sidebar`, `ad`, `banner`, `promo`,
   `comment`, `share`, `byline`, `pagination`, `cookie`, etc.).
2. Finds each text node's visual line boxes with `Range.getClientRects()` and
   the character offset where each line starts by bisection, so lines are known
   without touching the DOM.
3. For line index `i`, cuts the line into 12 colour steps interpolated between
   palette colour `i mod N` and colour `(i+1) mod N` (the end colour of each
   line matches the start of the next) and registers each step's characters as
   a `Range` with the CSS Custom Highlight API (`CSS.highlights`,
   `::highlight()` rules in a constructed stylesheet). Nothing is inserted
   into the page: no spans, no attributes, so host scripts' MutationObservers
   and React/Turbo reconcilers never see Buzzline.
5. Reapplies on window resize (the line grouping changes when text reflows)
   and watches the DOM with a `MutationObserver` (childList + characterData)
   to handle dynamic content.

Per-site opt-out: the popup shows the current hostname behind an "Enabled on"
toggle; switch it off to skip that site. Disabled hostnames are stored in
`chrome.storage.sync` under `disabledHosts` and are skipped even when the
global switch is on. Tick "Only for this site" next to the scheme picker to
remember a different color scheme for the current hostname.

Links inside colored text keep the gradient; their underline is drawn in a
neutral grey so it does not fight it (Settings → Coloring to turn that off).
On mid-tone surfaces (grey cards, tinted callouts) every palette colour is
nudged toward white or black until it reaches 4.5:1 contrast.

Keyboard: `Alt+B` toggles coloring, `Alt+S` sprint-reads the selection or the
page (change them at `chrome://extensions/shortcuts`). Right-click → "Sprint-read
selection", "Sprint-read this page" or "Open Buzzline reader".

Colours come from `::highlight()` rules, which win over the page's own text
colour and are not subject to page CSP. Requires Chrome 105+, Firefox 140+ or
Safari 17.2+; without the Highlight API Buzzline stays inactive.

Text is split on grapheme clusters via `Intl.Segmenter`, so emoji, flags,
and ZWJ sequences stay intact.

## Sprint (RSVP reader)

Every colored block gets a small yellow launcher icon at its start. Click
it to open **Sprint** — an RSVP overlay that flashes one word at a time
with the Optimal Recognition Point (ORP) highlighted in red and
horizontally aligned on a fixed guide so your eye stays still.

"Sprint this page" reads your current text selection if there is one,
otherwise the page's main prose container (nav, link lists, and hidden text
are ignored; inline `<code>` is kept). Lone punctuation marks are merged
into the neighbouring word so they never flash on their own.

Controls: play/pause (space), prev/next word (← / →), close (Esc), speed
slider (150–900 WPM, default 500). Punctuation and long words get
proportionally longer holds so you can catch clause boundaries; Settings lets
you change the sentence/comma hold multipliers and flash 1–3 words at a time.

The Reader overlay has a "Read aloud" button (browser text-to-speech) that
highlights the paragraph being spoken; click any paragraph to jump there.

## Color schemes

Preset palettes cycle through four colors — each line starts in one and ends
in the next, so adjacent lines share a handoff color. Every scheme has a
light and a dark variant; Buzzline picks one per text block from the
block's actual background (falling back to its text color), so dark-themed
pages and the OS dark mode are readable without a separate scheme.

- **Classic** — black / blue / black / red (dark: light gray / light blue / light gray / peach)
- **Ocean** — navy / teal / navy / seafoam
- **Bumblebee** — near-black / gold / near-black / brown
- **High contrast** — black / pure blue / black / pure red

## What gets colored

Only long stretches of prose a person reads. Buzzline first finds the page's
main prose container, then a 20-weight logistic model (`BLOCK_MODEL` in
`src/core.js`) scores each text block *before* it is split into spans, on
cheap features — length, link density, sentence shape, tag, width/position,
whether its ancestors look like metadata, references, ads, sidebars or
navigation, how much prose its neighbouring/sibling blocks hold, and
paywall/newsletter wording. Low-scoring blocks (bylines, captions, citations,
listing cards, "Updated on …" rows) are left untouched; blocks under 50
characters are never colored.

The model was fit on 5.5k LLM-labelled blocks from 82 real sites (news,
docs, wikis, forums, listings, four languages; `tests/e2e`), with the ~15%
contested labels re-judged by a stronger model. Char-weighted precision /
recall of what gets colored, root pick alone → with the model:

| | precision | recall |
|---|---|---|
| leave-one-site-out, 66 training sites | 0.821 / 0.980 → 0.930 / 0.901 |
| 16 sites never used for fitting | 0.830 / 0.923 → 0.972 / 0.902 |

Known misses: paywall / subscribe paragraphs on some news sites still pass
(they are structurally real paragraphs), and slideshow-style listicles whose
body text sits in `*-caption` containers are under-colored. Refit with
`node tests/e2e/train.js`; `tests/e2e/collector.js` is the page-side block
collector; the committed data holds per-block features and labels only, never
page text. Blocks you mark "should / shouldn't be colored" from the popup are
stored locally (features only) and can be exported from Settings to grow the
dataset.

## Performance

Colouring never mutates the page, so there is no relayout or host-observer
cost; the remaining work is reading line boxes and creating Ranges, done per
block, nearest-to-viewport first: ~40 ms synchronously at injection, then
`requestIdleCallback` slices (~12 ms). Pages whose prose exceeds 150k
characters only colour blocks within two screens and catch up on scroll, so
the number of live Ranges stays bounded on books. Measured in headless
Chromium (longest main-thread task after injection): GitHub README 53 ms,
GitHub PR 96 ms, HN thread none over 50 ms, Wikipedia *Honey bee* 79 ms,
Wikipedia *Roman Empire* 174 ms (first paint of its very long lead
paragraphs), 720k-character Gutenberg novel none over 50 ms. The original
per-character-span engine blocked for 846 ms / 3.1 s on the last two and
triggered an 830 ms task in GitHub's own scripts on the README.

## Known limitations

- Does not descend into iframes or shadow DOM in this release.
- Code blocks, inputs, and contenteditable regions are intentionally left
  alone.
- Vertical writing modes (`writing-mode: vertical-rl` etc.) are detected and
  skipped — those blocks stay their original color.

## Files

```
manifest.json          Chrome MV3 manifest
src/content.js         Per-char span + gradient engine, block classifier, Sprint launchers, Reader
src/core.js            Shared pure helpers: schemes, colour math, block model, Sprint tokenizer
src/sprint.js          RSVP reader overlay (ORP-aligned word flashing, chunking)
src/background.js      Service worker: context menu + keyboard commands
src/content.css        Base CSS + launcher + Sprint/Reader overlay styles
src/popup.html/css/js  Toolbar popup (toggle, scheme picker, per-site scheme, feedback)
src/options.html/css/js Settings page (Sprint, coloring, blocked sites, feedback export)
tests/core.test.js     Unit tests for core.js (`node --test`)
tests/e2e/             Block collector, labelled dataset and model trainer
scripts/build_firefox.js  Writes dist/firefox/ with a Firefox manifest (event page, gecko id)
icons/                 Extension icons (cropped from assets/logo.png)
scripts/gen_icons.py   Regenerates the icons (Pillow)
```

## Dev notes

- No build step. Edit files, reload the extension in `chrome://extensions`,
  reload the page.
- State lives in `chrome.storage.sync` under `enabled`, `scheme`,
  `disabledHosts`, `siteSchemes`, `linkUnderline`, `sprintWpm`, `sprintChunk`,
  `sprintDelays`; model feedback lives in `chrome.storage.local.feedback`.
- Firefox: `node scripts/build_firefox.js`, then load `dist/firefox/` from
  `about:debugging`. Untested here — Firefox MV3 treats host permissions as
  optional, so enable "Run on all sites" in the add-on's settings.
- To regenerate icons: `python3 scripts/gen_icons.py`.

## Caveat

BeeLine Reader's gradient technique is covered by US Patent 9,026,907.
Personal/educational use is generally fine; consult a lawyer before
distributing publicly.
