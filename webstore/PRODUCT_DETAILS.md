# Chrome Web Store listing — Buzzline

Copy each block into the matching field of the Developer Dashboard.
Upload package: `node scripts/package.js` → `dist/buzzline-<version>.zip`.

---

## Store listing → Product details

**Title from package:** Buzzline *(from manifest.json; not editable here)*

**Summary from package:** Eye-guiding color gradients that pull your eyes through long blocks of text. *(manifest.json `description`, max 132 chars)*

**Description** (paste as-is):

```
Buzzline colours long stretches of text with a gentle gradient that runs from the end of one line into the start of the next. Your eye follows the colour down the page, so you lose your place less and read long articles, docs and threads with less effort.

WHAT GETS COLOURED
Only the text you actually read. A small built-in model looks at each block of text and colours articles, documentation, READMEs and comment threads, while leaving menus, ads, buttons, search results, bylines, captions and headings alone. It runs entirely on your device.

WORKS ON LIGHT AND DARK PAGES
Every colour scheme has a light and a dark variant, picked automatically per block of text, and colours are always kept readable against the page background.

SPRINT: SPEED READING
Press Alt+S (or right-click → "Sprint-read this page") to read the page one word at a time in a focused overlay, with the optimal recognition point highlighted. Adjustable speed, pause, step forward and back. Select text first to sprint just the selection.

READER VIEW AND READ ALOUD
Open the Buzzline reader for a clean, coloured, distraction-free copy of the article, with a Read aloud button that highlights each paragraph as it is spoken.

YOUR CONTROLS
• Turn Buzzline on or off with one click or Alt+B
• Switch it off on specific sites, or pick a different colour scheme per site
• Four colour schemes: Classic, Ocean, Bumblebee, High contrast
• Optional link underlines
• Mark text that should or shouldn't be coloured; it is remembered on your device

PRIVATE BY DESIGN
Buzzline makes no network requests, has no analytics and collects no data. Settings are stored in your browser's own sync storage.

Keyboard shortcuts can be changed at chrome://extensions/shortcuts.
```

**Category:** Accessibility *(alternative: Productivity → Tools)*

**Language:** English (United States)

---

## Graphic assets

| Field | File | Size |
|---|---|---|
| Store icon * | `store-icon-128.png` | 128×128 (96×96 artwork, 16 px transparent padding, per Google's guidelines) |
| Screenshots (1–5) | `screenshot-1-article.png` — colouring on an article | 1280×800 |
| | `screenshot-2-dark.png` — dark page, automatic dark palette | 1280×800 |
| | `screenshot-3-sprint.png` — Sprint speed reader | 1280×800 |
| | `screenshot-4-reader.png` — Reader view with read aloud | 1280×800 |
| Small promo tile | `promo-small-440x280.png` | 440×280 |
| Marquee promo tile | `promo-marquee-1400x560.png` | 1400×560 |

Global promo video: leave empty.

---

## Additional fields

**Official URL:** none *(requires a verified domain; leave unset)*

**Homepage URL:** `https://github.com/shaunpatterson/buzzline`

**Support URL:** `https://github.com/shaunpatterson/buzzline/issues`

**Mature content:** No

---

## Privacy practices tab

**Single purpose description:**

```
Buzzline adds reading-guide colour gradients to the text of web pages so the reader's eye moves smoothly from one line to the next. Its Sprint (one word at a time) and Reader views present the same page text in a focused overlay.
```

**Permission justifications:**

`storage`
```
Saves the user's settings (on/off, colour scheme, sites where Buzzline is turned off, per-site scheme, Sprint speed) and the user's own "should/shouldn't be coloured" marks. Nothing is sent off the device.
```

`activeTab`
```
Lets the keyboard shortcuts (Alt+S Sprint, Alt+B toggle) and the toolbar popup act on the tab the user is currently looking at.
```

`contextMenus`
```
Adds three right-click menu items: "Sprint-read selection", "Sprint-read this page" and "Open Buzzline reader".
```

Host permission (content script on `<all_urls>`)
```
Buzzline's single purpose is to colour the text of whatever page the user is reading, so its content script must run on every site. It only reads page text locally to decide which blocks to colour; it makes no network requests and sends no page content anywhere. Users can turn it off per site from the popup.
```

**Remote code:** No, I am not using remote code.

**Data usage** — collected data: tick **none** of the categories.

Certifications (tick all three):
- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** `https://github.com/shaunpatterson/buzzline/blob/main/PRIVACY.md`

---

## Distribution tab

- **Payments:** Free
- **Visibility:** Public *(or Unlisted for a soft launch)*
- **Regions:** All regions

---

## Before you press Submit

- [ ] The BeeLine Reader patent question (US 9,026,907, see README "Caveat") is settled
- [ ] `manifest.json` version bumped if a previous zip was ever uploaded
- [ ] Zip rebuilt with `node scripts/package.js` after the last code change
