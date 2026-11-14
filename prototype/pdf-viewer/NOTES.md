# PROTOTYPE: Buzzline on PDFs (throwaway)

**Question:** what should Buzzline look like on a PDF: the PDF's own layout with a
gradient laid over each line ("Original"), or the text reflowed into a reading
column and coloured by the existing extension code ("Reader")?

## Run it

With Docker, from the repo root:

    docker build -f prototype/pdf-viewer/Dockerfile -t buzzline-pdf-prototype .
    docker run --rm -p 127.0.0.1:8791:8791 buzzline-pdf-prototype

Keep the `127.0.0.1:`: the server will fetch any http(s) address it is given, so it
must not be reachable from the network.

or without: `node prototype/pdf-viewer/serve.js`. Then open http://127.0.0.1:8791/.

Switch views with the Original / Reader control or the arrow keys (`?variant=A|B`).
Open another PDF by URL, by file, or by dropping one on the page. The server fetches
URLs on the browser's behalf, since most hosts send no CORS headers.

## What it is made of

- `index.html`: the whole viewer. pdf.js draws each page and lists its text; the text
  is grouped into lines and paragraphs by position. "Original" lays a gradient strip
  over each line, blended so dark glyphs take the colour and the paper stays white.
  "Reader" builds plain paragraphs and lets the extension's real content scripts
  (`src/`, loaded with a fake `chrome`) colour them; Sprint is the real one too.
- `serve.js`: static files, the PDF proxy, and pdf.js (from `vendor/`, which the
  image downloads at build time; fetched from the CDN once otherwise).
- Nothing here ships: `scripts/package.js` packages `manifest.json`, `src/`, `icons/`.

## Known shortcuts

- First 15 pages only.
- Line and paragraph grouping is simple geometry. Two-column PDFs are untested.
- "Body text" = paragraphs in the document's most common font size, so references set
  at that size are coloured too.
- The dark page is a CSS invert of the drawn page, so figures invert as well.
- Scanned PDFs have no text and cannot be coloured.

## Verdict

_To fill in: which view, what to take from the other, what to change._

Then delete this directory and build the real viewer in `src/`.
