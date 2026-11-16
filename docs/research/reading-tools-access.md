# Typography, comfort and accessibility tools: what Buzzline could borrow

Researched 16 November 2026 for Buzzline. Scope: dyslexia fonts, spacing and line-length controls, browser reader modes, Microsoft Immersive Reader features, reading rulers, tints and dark modes, text-to-speech with highlighting, and translate, summarise and define helpers.

## Summary

The best-supported finding in this area is also the cheapest to build: how widely letters, words and lines are spaced, and how long lines are, can change reading speed or accuracy for some readers, mostly children and adults with dyslexia, whereas special letter shapes do not (a 2026 meta-analysis of 15 studies found no effect, g = −0.04) [2][6][9][10][5]. Spacing effects are modest and inconsistent between studies, so the defensible product is user-controlled spacing, size and column width, not a "dyslexia font" claim [3][5]. Chrome, Edge, Firefox and Safari already ship reader modes with font, size and colour controls, and Chrome and Edge also read aloud, so Buzzline's room to differ is in its own surfaces: the Reader overlay, the gradient PDF reader and the coloured page. Text-to-speech helps comprehension for students with reading difficulties on average (d = 0.35) [19] but nothing found tests word-by-word highlighting separately, and Buzzline already reads paragraphs aloud with the current paragraph highlighted [42], so the gap is per-word highlighting, voice and speed choice, and speaking in the PDF reader. My top three picks are at the end of the note: a text-and-spacing panel for Reader and PDF Reader, word-level highlighting for read-aloud, and a line-focus ruler.

## How to read this note

- Numbers in square brackets refer to the source list at the end. Every source in that list was opened on 16 November 2026 unless it appears under "Could not verify".
- For papers where only the abstract or a PubMed record was read, claims are limited to what that text states. Where I read the full text, the entry says so.
- **Inference** marks a conclusion of this note that no source states directly.
- Evidence labels: *strong* = systematic reviews or several controlled studies that agree; *moderate* = at least one peer-reviewed controlled experiment with a clear effect; *mixed* = peer-reviewed studies that disagree; *weak* = one small, indirect or non-peer-reviewed study; *none found* = no independent evidence turned up in the searches run; *first-party* = the vendor's own description, not independently checked.
- Effort: **small** ≈ a day, **medium** ≈ a week, **large** = more.
- Buzzline's existing state, from the repo as of today [42]: the Reader overlay has a fixed 16px body at line-height 1.7, no font, size, spacing or width controls, and a paragraph-by-paragraph "Read aloud" button using `speechSynthesis`; the PDF reader's reflow view has a text-size control; the coloured page itself uses the CSS Custom Highlight API.
- Colour overlays, background colours and dark pages are covered in more depth in `docs/research/colour-schemes.md` (sections 4 and 5) [43]; this note only summarises them.

## 1. What the research says

### 1.1 Dyslexia-specific letter shapes: no benefit found

| Study | Who | Finding | Strength |
|---|---|---|---|
| Wery & Diliberto 2017 (OpenDyslexic) [1] | 12 elementary pupils at a school for dyslexia (11 completed all tasks); OpenDyslexic vs Arial vs Times New Roman; letter naming, word and nonsense-word reading | "no improvement in reading rate or accuracy for individual students with dyslexia, as well as the group as a whole"; none of the pupils said they preferred it | weak–moderate (small single-subject design; read-aloud lists, not passages) |
| Kuster et al. 2018 (Dyslexie) [4] | 170 children with dyslexia (text, Exp. 1); 102 with and 45 without dyslexia (word lists, Exp. 2) | Not faster or more accurate than Arial; most children preferred Arial; preference unrelated to performance. Conclusion: neither benefits nor impedes | moderate |
| Marinus et al. 2016 (Dyslexie) [3] | 39 low-progress readers learning English | Dyslexie gave 7% more words per minute than standard Arial, but the difference was no longer significant when Arial was given Dyslexie's within-word and between-word spacing. Authors: the effect comes from spacing, not letter shapes | moderate |
| Galliussi et al. 2020 [5] | 64 children with dyslexia and 64 without, Italian | "failed to show any effect from the letterform"; extra letter spacing without extra word spacing slowed reading; measured spacing effects were below 0.20 syllables/s ("not practically meaningful") | moderate |
| Rello & Baeza-Yates 2013 [8] | 48 readers with dyslexia, eye tracking, 12 fonts, 60-word texts (full text partly read) | Abstract: sans serif, monospaced and roman styles beat serif, proportional and italic. In the results I read, Arial Italic was the worst font and the italic main effect on reading time was not significant (p = 0.09); OpenDyslexic did not stand out [8]. Kuster et al. describe the sample as mean age 20 (range 11–50) and say the study found no decrease in reading time for OpenDyslexic and a preference for Verdana and Helvetica [4] | weak–moderate |
| Alexeeva et al. 2022 (LexiaD, a Cyrillic dyslexia font) [13] | 34 adolescents with and 28 without dyslexia, eye tracking | Arial was faster at the start; LexiaD did better by the end once readers got used to it; authors call for a follow-up | weak |
| Azzarello et al. 2026, meta-analysis [6] | 15 studies, 91 effect sizes, N = 688 readers with dyslexia | "no consistent or reliable effect on reading performance in terms of speed or accuracy"; g = −0.04, 95% CI [−0.15, 0.07]. Abstract only (paywalled) | strong, for the narrow claim that dyslexia fonts do not help |

The International Dyslexia Association's newsletter summarises the two Annals studies the same way and adds that there is "no harm or reason to discourage children from reading in Dyslexie, if they wish" [7]. Wery and Diliberto suggest the font's design may rest on the letter-reversal idea of dyslexia, which they say four decades of research do not support [1].

**What this means for Buzzline.** Offering a dyslexia font as a choice is harmless and cheap, and some readers like it; claiming it improves reading is not supported. Fonts matter more as a personal preference than as an intervention (see 1.3).

### 1.2 Spacing and line length: the better-supported lever, with caveats

- **Extra-large letter spacing, children with dyslexia.** Zorzi et al. 2012 (full text read): 74 children aged 8–14 (34 Italian, 40 French) read 24 short, unrelated, high-frequency sentences. Letter spacing +2.5 pt on 14 pt Times (about +18% of body size [5]) roughly halved errors; a second experiment with 20 Italian children matched for line spacing found fewer errors (6 vs 11.8) and faster reading (1.87 vs 1.64 syllables/s). The benefit was specific to dyslexic readers against younger reading-level controls for errors, and only marginally so for speed. Limits: short unrelated sentences, children, paper [2]. Evidence: moderate.
- **Replications are partial.** Galliussi et al. report that Hakvoort et al. (2017) found fewer errors but no speed gain with extra spacing, that Duranovic et al. (2018) found an accuracy but not a speed gain, and that their own, smaller spacing increase gave no general speed benefit [5]. Van den Boer and Hakvoort (2015), as summarised by Kuster et al., found no benefit beyond default spacing for word reading and a cost from reduced spacing [4]. Evidence: mixed.
- **Word spacing must go up with letter spacing.** In [5], increasing letter spacing while leaving word spacing at its default was the one condition that slowed both readers with and without dyslexia; the settings tested were +70/1000 em for letters and +270/1000 em for words. This is the most directly usable number found.
- **Who benefits.** Joo et al. 2018 (abstract read via a summary): adults with dyslexia who showed elevated visual crowding read faster with increased letter, word and line spacing; others did not [11]. Evidence: moderate, adults, one study.
- **Short lines.** Schneps et al. 2013 (eye tracking, high-school students with dyslexia) found that reading on a small device (short lines) raised reading speed by 27%, halved regressive saccades, and cost no comprehension [10]. In a separate study of 103 students (3.4 words per line on an iPod at 42 pt vs 13.9 on paper at 14 pt) there was no overall benefit; the device helped subsets (low visual-attention span for comprehension, weak phoneme decoding for speed) and hurt others [9]. Evidence: moderate, specific to certain readers; **inference:** a user-adjustable column width lets each reader find their own setting.
- **Text size.** Kuster et al. cite O'Brien et al. (2005) as finding that children with dyslexia need a larger print size for maximum reading speed than typical readers [4]; I did not open that paper. Evidence: moderate (second-hand).
- **A published baseline.** WCAG 2.2 success criterion 1.4.12 treats line height 1.5, paragraph spacing 2× font size, letter spacing 0.12 em and word spacing 0.16 em as the settings a page must survive when a user overrides spacing [23]. These are a reasonable default ceiling for a first slider range; they are accessibility requirements, not evidence that those values improve reading.

### 1.3 Personalisation

Sheppard et al. 2023 (abstract read): 94 children, kindergarten to grade 8; six font variations differing in character width and inter-letter spacing. Each child's "personal best" variation gave significantly higher comprehension accuracy in both experiments and faster reading in the passage experiment; 58% of children had a stable personal best [12]. This points the same way as [11] and [9]: the best setting differs between readers, so controls beat a single "accessible" preset. Evidence: moderate, children. A related paper, Wallace et al. (ACM TOCHI 2022, "Different Fonts Increase Reading Speed for Different Individuals"), appeared in search results; I could not open it (see "Could not verify").

### 1.4 Reading rulers and line focus

Niklaus et al. 2023 (CHI '23), as summarised by Readability Matters with the abstract quoted there: four digital rulers (grey bar, lightbox, shade, underline) tested on 91 crowdsourced readers with dyslexia and 86 without; "all four digital ruler designs led to significant improvements in reading speed for both readers with and without dyslexia", largest for readers with dyslexia; no single design was preferred by everyone; code is open source (Adobe) [18]. Limits: crowdsourced, online, short passages, authors at Adobe; I did not open the full paper (ACM blocked). Evidence: weak–moderate. Microsoft's support page lists line focus as one of Immersive Reader's features and says it "sustains attention and improves reading speed" under a "Proven benefits" column with no citation [25]; I found no separate independent test of Immersive Reader's line focus. Evidence for that claim: first-party.

### 1.5 Text-to-speech and highlighting

Wood et al. 2018 (meta-analysis, abstract read): text-to-speech and related read-aloud tools improved reading comprehension for students with reading difficulties, d = 0.35, 95% CI [0.14, 0.56]; study design explained some of the variance [19]. It does not separate highlighting from plain speech. Evidence: moderate (meta-analysis of mixed studies). I found no independent study of word-by-word versus paragraph-level highlighting in the searches run; two candidate papers (Bonifacci 2022 on mind wandering, and an Annals of Dyslexia 2023 study of TTS features) showed up and I could not read their results (see "Could not verify"). Chrome's own reading mode offers word, sentence and "adaptive" highlighting [28], so that feature is available to users already; nothing shows which mode is best.

A RAND Europe randomised trial of an intervention built on Microsoft's Immersive Reader is a caution for any bundled "toolkit" claim: classes of 8–9-year-olds showed no significant difference on reading outcomes against business as usual, but schools did not implement it as intended and many dropped out, so the result neither confirms nor refutes the tool [26].

### 1.6 Tints, dark mode and sepia

- **Coloured overlays and lenses.** An overview of four systematic reviews: three concluded the evidence is insufficient and one concluded it supports use; "on balance … not yet a reliable evidence base on which to recommend coloured overlays or lenses" [20]. Edge's reading mode nevertheless ships "themes inspired by Irlen Spectral Filters" [27]. Evidence: weak. Detail in [43].
- **Dark vs light.** Piepenbrock et al. 2013: dark text on a light background beat light on dark for acuity and proofreading, in both younger and older adults [21]. Nielsen Norman Group's summary: light mode tends to be better for people with normal or corrected vision, dark mode may help some with cataract and related conditions [22]. Evidence: moderate for light mode on proofreading; dark mode is a comfort and preference choice.
- **Sepia, cream and other backgrounds.** No independent controlled study of sepia specifically was found in the one search run; see [43] for the background-colour work already reviewed. Evidence: none found.

## 2. Tools and features found

Buzzline's current features are not listed as candidates. "Fit" says whether it works in an extension and on PDFs.

| # | Name | What it does | Cost / who | Evidence | Effort for Buzzline | Fit |
|---|---|---|---|---|---|---|
| 1 | **OpenDyslexic** font | Heavier-bottomed letters; used as an option in Kindle, Instapaper and Kobo (as reported in [13]) | Free, SIL OFL licence, donations optional [17] | None for benefit (Wery & Diliberto; meta-analysis) [1][6] | Small: bundle a font file as a Reader/PDF Reader choice | Reader overlay and PDF reflow yes; PDF "Original" view is canvas, no |
| 2 | **Dyslexie** font | Same idea, Dutch designer | Not checked | None for benefit [3][4] | Small, but not recommended (licence and price not verified) | As row 1 |
| 3 | **Lexend** (7 widths/spacings, Deca to Zetta) | Variable font; wider spacing steps matched to the reader's reading speed | Free on Google Fonts [15]; OFL licence per a GitHub listing in search results (not opened) | First-party; own demonstration of 20 third graders (p = 0.014) with no method detail on the page [14] | Small: bundle; or medium if offering the width axis as a "spacing level" control | As row 1 |
| 4 | **Atkinson Hyperlegible** (and Next) | Letterforms made distinct for low vision (B/8, O/0, 1/I/l) | Free for personal and commercial use [16] | None independent found; designed for low vision, not dyslexia [16] | Small: bundle | As row 1; helps most as a clear sans default |
| 5 | **EasyReading** font (Italian) | Dyslexia font with wider letter and word spacing | Not checked | Positive (Bachmann 2013) but letterform and spacing not separated [5] | Not recommended: cannot separate font from spacing | Not applicable |
| 6 | **LexiaD** (Cyrillic) | Dyslexia font for Russian | Not checked | Weak, mixed [13] | Not relevant unless Cyrillic is a goal | Not applicable |
| 7 | **Spacing controls** (letter, word, line) | User sets spacing | Built in Chrome reading mode, Firefox 129+, Helperbird (free) [28][31][37] | Mixed to moderate; best for crowding-prone readers [2][5][11] | Small in Reader/PDF Reader; medium on the coloured page (**inference:** gradient depends on line breaks) | Reader/PDF reflow yes; page medium; PDF Original no |
| 8 | **Column width / line length** | User sets line length | Edge column width; Helperbird paragraph width [27][37] | Moderate for certain readers [9][10] | Small in Reader; medium on the page | Reader/PDF reflow yes; page medium |
| 9 | **Text size controls** | Larger text | Every reader mode [27][28][29] | Moderate (second-hand) [4] | Small: Reader; PDF reflow already has it [42] | Reader yes; PDF Original has zoom already |
| 10 | **Firefox Reader View** | Article view; font, size, Text and Layout menu with character spacing, word spacing and alignment since Firefox 129; contrast, gray and custom colours; Narrate (read aloud, 2016) | Free, built in | Not tested | Not applicable (benchmark) | Firefox only; Mozilla's own page was blocked, so details rely on a secondary report [31] |
| 11 | **Safari Reader** | Article view; background theme, font, zoom; table of contents and summary on long articles | Free, built in; summaries need Apple Intelligence [29][30] | Not tested | Not applicable (benchmark) | Safari only |
| 12 | **Edge Reading mode** (Immersive Reader) | Font, size, column width, themes (incl. Irlen-inspired); Read aloud with natural voices; Translate (70+ languages); Summarize and Explain via Copilot | Free, built in [27] | Not tested individually | Not applicable (benchmark) | Edge only |
| 13 | **Chrome Reading mode** | Font, size, theme, line height, letter spacing, line focus, links and images toggle; read aloud with voice and speed choice and word/sentence/adaptive highlighting; downloads Google natural voices | Free, built in [28] | Not tested individually | Not applicable (benchmark; narrows the gap for read-aloud) | Chrome only; "not available to all websites" [28] |
| 14 | **Immersive Reader: syllables** | Splits words into syllables | Free in Microsoft apps; SDK on Azure [24] | First-party "targets word recognition and pronunciation" [25]; none independent | Medium: needs an English syllabifier (**inference:** vendored list or rules; limited languages) | Reader overlay yes |
| 15 | **Immersive Reader: parts of speech** | Colours nouns, verbs, etc. | As row 14 | First-party "supports grammar instruction" [25] | Large: needs a part-of-speech tagger (**inference**) | Reader overlay |
| 16 | **Immersive Reader: picture dictionary** | Image for common words | As row 14 | None found | Large: image source and licensing | Reader overlay |
| 17 | **Immersive Reader: line focus** | Shows a small window or line | As row 14 | First-party [25] | Medium (see row 20) | Page yes (overlay); PDF reflow yes |
| 18 | **Immersive Reader as a service** | Azure SDK that embeds the Reader in an app; docs page updated Sept 2026 [24] | Azure pricing not checked | RAND RCT: no significant difference; implementation problems [26] | Large: needs an Azure resource and backend; not suitable for a no-build extension | No |
| 19 | **Microsoft "comprehension mode"** | Listed in Microsoft's table as improving comprehension "by an average of 10%" [25] | Free | First-party, uncited | Unknown (feature not documented in pages read) | Unknown |
| 20 | **Digital reading rulers** (grey bar, lightbox, shade, underline) | Highlights or dims around the current line | Open-source (Adobe) [18] | Weak–moderate: 177 crowdsourced readers [18] | Small (Reader), medium (page, PDF Original) | Page and Reader yes; PDF Original possible with overlay |
| 21 | **Helperbird focus ruler / dyslexia ruler / reading guide** | Dims page except a band; ruler follows cursor | Free in extension [37] | None found | As row 20 | Extension, any page, PDFs in its own reader |
| 22 | **Coloured overlay / tint** | Colour wash over page | Helperbird: 24 colours [37]; Edge themes [27] | Insufficient to recommend [20] | Small, not recommended | Page yes; PDF Original yes |
| 23 | **Dark / sepia Reader themes** | Reader background and text colour | Built in to the browser readers [27][28][29] | Light polarity better for proofreading [21]; sepia: none found | Small: theme toggle on Reader (Reader CSS is light-only) [42] | Reader yes; PDF reflow yes |
| 24 | **Read Aloud** (extension) | Reads the article; Reader Mode with sentence highlight (Oct 2026); Chrome natural voices; on-device Pocket TTS voices (English, ~60 MB) | Free core; a third-party review in search results says some cloud voices need a purchase or API key; MIT licence per a GitHub listing (not opened); 6,000,000 users on Chrome, rated 3.8 from 3.7K ratings [34][35] | TTS in general: d = 0.35 [19] | Not applicable (benchmark) | Chrome, Firefox, Edge; pages |
| 25 | **Speechify** | Cloud TTS app and extension | Free: up to 1.5× and 10 "robotic sounding voices"; Premium $29/month or $139/year, 400+ voices, 5× speed, AI summaries [32] | None independent for the product; TTS in general d = 0.35 [19] | Large and costly if matched; not recommended | Chrome extension, apps |
| 26 | **NaturalReader** | TTS web app, mobile app, Chrome extension, "Highlight to Read" | Lite $13.90/month or $79/year; other plans not read [33] | As row 25 | Not applicable (benchmark) | Extension |
| 27 | **Voice Dream Reader** | TTS for PDFs, EPUBs, web; highlighting, notes, pronunciation dictionary | Free to download, in-app purchases; 4.5 stars, 14K+ ratings [36]; price not confirmed first-party | As row 25 | Not applicable (benchmark) | iOS/macOS apps; not an extension |
| 28 | **Helperbird** (umbrella extension) | 50 tools: fonts, spacing, rulers, tint, dictionary, summarise, translate, immersive reader, TTS, speed reading, PDF reader, highlighter | Free core with Pro tier; price not found on page [37] | None found | Not applicable (benchmark; competitor for this audience) | Chrome, Edge, Firefox, Safari |
| 29 | **Word-level speech highlighting** | Highlights the word being spoken | Chrome reading mode has it [28]; Read Aloud highlights sentences [34] | None found specifically | Medium | Reader/PDF reflow yes; needs voices with boundary events [40] |
| 30 | **Translate** | Whole-page or selection into another language | Edge 70+ languages [27]; Helperbird 64 languages free [37]; Chrome built-in Translator API (Chrome 138, desktop only) [39] | None found for reading outcomes | Medium for Chrome-only via API; large across browsers | Page; PDF reflow |
| 31 | **Summarise** | Short summary of the page | Edge Summarize/Explain (Copilot) [27]; Safari Summarize (Apple Intelligence) [30]; Speechify, Helperbird Pro [32][37]; Chrome Summarizer API (Chrome 138 stable; Firefox and Safari not supported) [38] | None found for reading outcomes | Medium (Chrome-only API; hardware requirements apply) | Page; PDF reflow |
| 32 | **Define / dictionary on select** | Popup with definition | Helperbird highlight menu (free) and dictionary (Pro) [37]; Immersive Reader picture dictionary [24] | None found | Medium (**inference:** needs a dictionary source; privacy trade-off if an online API) | Page; Reader; PDF reflow |

## 3. Promising items

### 3.1 Text-and-spacing panel for Reader and PDF Reader (font, size, letter/word/line spacing, column width, theme)

- **What it is.** One panel with: font (system sans, optionally bundled Atkinson Hyperlegible, Lexend, OpenDyslexic as choices), text size, letter spacing, word spacing, line height, column width, and a light/dark Reader theme. Remembered per user.
- **Who uses it.** Every browser reader mode has a subset; Chrome has line height and letter spacing, Firefox 129 added character and word spacing, Edge has column width, Safari only theme, font and zoom [27][28][29][31]. Helperbird offers spacing, width and fonts on any site [37].
- **Evidence.** Spacing and width: moderate and mixed, strongest for crowding-prone readers [2][5][9][10][11]; per-reader best settings differ [12]; fonts: no effect found [6]. So the panel's value is choice, not a preset.
- **Design hints from the evidence.** Keep word spacing at least as large as letter spacing [5]; give the sliders a ceiling near the WCAG values and a bit beyond, as Zorzi's +18% was far above them [2][23]; do not market any font as therapeutic [6].
- **Effort: medium.** The Reader overlay is Buzzline's own DOM with a fixed CSS block [42], so CSS variables and a settings object in `settings.js` cover it; bundling three font files and a panel UI is the larger part. The PDF reflow view already has a `--size` variable [42]. Extending the controls to the live coloured page is a separate, larger step (**inference:** the gradient depends on text laid out in lines, so spacing changes would need the colouring to be recomputed).
- **Fit.** Reader overlay and PDF Reader reflow view: yes. PDF Original view: no (a rendered canvas with gradient strips). Coloured page: only after the layout interplay is checked.

### 3.2 Word-level highlighting for read-aloud, with voice and speed choice, also in the PDF reader

- **What exists in Buzzline.** Paragraph-by-paragraph read-aloud with the current paragraph highlighted, click to jump, a Stop button [42]. No voice or speed choice, no per-word highlight, nothing in the PDF reader.
- **What others do.** Chrome reading mode: voice and speed, word/sentence/adaptive highlight [28]. Edge: natural voices, speed, paragraph skip, and its description says Read aloud covers webpages and PDFs [27]. Read Aloud: sentence highlight in a Reader Mode, plus free on-device Pocket TTS voices (Oct 2026) [34]. Voice Dream, NaturalReader and Speechify are paid apps and extensions [32][33][36]. Helperbird offers read-aloud for webpages and PDFs with device voices free [37].
- **Evidence.** TTS for readers with difficulties: d = 0.35 [19]. Highlighting granularity: none found.
- **Technical risk, from sources.** The Web Speech `boundary` event is the usual way to learn which word is being spoken [41]. Readium's browser notes say Chrome desktop's built-in Google voices "do not return boundary events" and have a bug with utterances over 14 seconds; Edge's natural voices are online and Firefox ships no voices of its own [40] (figures dated April 2024; I did not retest). The Chromium issue tracker also has reports that `onboundary` does not fire (titles only seen). **Inference:** a robust version speaks one sentence per utterance (this also avoids the 14-second bug), highlights the sentence always, and highlights words only when the chosen voice emits boundary events, otherwise estimating word position from time.
- **Effort: medium.** Buzzline already uses the Custom Highlight API for colouring, so a word `Range` highlight is a natural fit [42]; most work is sentence splitting, a voice and rate picker, handling voices without boundaries, and reading text in the PDF reflow view.
- **Fit.** Reader overlay: yes. PDF Reader reflow view: yes (text exists). Original PDF view: only by speaking the same extracted text. Coloured page: possible by reading the page's reading text (it already has a classifier), but then highlighting would sit over the gradient.

### 3.3 Line-focus ruler

- **What it is.** A band, underline or dimmed page around the line being read, following the pointer, keyboard or scroll.
- **Who has it.** Chrome reading mode (underline or small/medium/large window, static or following the cursor, Alt+L) [28]; Immersive Reader line focus [25]; Helperbird rulers and reading guide [37]; Adobe's open-source rulers [18].
- **Evidence.** Weak–moderate: one study, crowdsourced, 177 readers, speed gains for all four designs [18]; Microsoft's line-focus claim is first-party [25]. Whether it adds to a line-gradient is untested (**inference:** both are per-line cues; the effect of combining them is unknown).
- **Effort: medium.** A fixed-position overlay element driven by pointer and scroll, with four styles and colour settings, is a day or two in Reader; on the live coloured page and on the PDF Original view it must follow line boxes and page scrolling.
- **Fit.** Coloured page and Reader: yes. PDF Original: yes with an overlay positioned over the page canvas.

### 3.4 Honourable mentions

- **Reader theme toggle (light/dark/sepia): small.** Reader CSS is light-only today [42]. Light polarity is better for proofreading [21]; give users the choice. Evidence for sepia: none found.
- **Define-on-select: medium.** Free to build as a small popup, but needs a dictionary source; online services cost privacy, offline lists cost size (**inference**). No evidence on reading outcomes found. Helperbird gates its dictionary behind Pro [37], which suggests demand.
- **Summarise and translate through Chrome's built-in APIs: medium.** Summarizer and Translator are stable in Chrome 138 on desktop with Firefox and Safari unsupported [38][39]; the summariser uses an on-device generative model with hardware requirements, so it would be a Chrome-only feature. No evidence on reading outcomes found.

## 4. What I would not build

- **A "dyslexia font" claim.** Evidence points to no effect from letter shapes [1][3][4][5][6].
- **Coloured overlay or tint as an intervention.** Reviews find insufficient evidence [20]; Buzzline already has colour schemes with a documented contrast rule [43].
- **Parts-of-speech colouring, picture dictionary, or the Azure Immersive Reader service.** Large effort, vendor-only claims of benefit, and the only controlled trial found was null (with poor implementation) [24][25][26].
- **Cloud TTS à la Speechify.** Cost, privacy, and backend; a browser-based option with local voices covers the same user need [32][34].

## 5. Top three picks for Buzzline

1. **Text-and-spacing panel for Reader and PDF Reader.** It is the only feature here backed by several peer-reviewed experiments (spacing, width, personalisation), it is the one thing Buzzline's Reader plainly lacks (fixed 16px, no controls), and it needs no new infrastructure [2][5][9][10][12][42]. Be honest in the UI: offer fonts as choices and do not claim benefits for them [6].
2. **Per-word read-aloud highlighting, voice and speed choice, also in the PDF reader.** Buzzline already has the read-aloud and the highlight mechanism, and TTS has meta-analytic support for readers with difficulties [19][42]. Browser readers do not reach Buzzline's own overlay or its gradient PDF reader, though Edge already reads PDFs aloud [27]. Build sentence-level first and word-level where the voice supports it [40].
3. **Line-focus ruler.** Medium effort (small in Reader), the best evidence available for rulers is from 2023, and it complements a line-based colouring system rather than competing with it [18]. Treat the gain as unproven for combined use with the gradient.

## 6. Could not verify

- **Mozilla's Firefox Reader View help page** (blocked); Reader View options for Firefox 129 are from a secondary report [31]. The 2016 Narrate feature is only from a search snippet (Techdows).
- **Microsoft Garage "Learning Tools" page** (blocked); Microsoft's own "Proven benefits" table is quoted from [25] and carries no citations. I did not find what Microsoft's "comprehension mode" does.
- **Wallace et al. 2022 (ACM TOCHI, individuated fonts)** and the full **Niklaus et al. 2023 (CHI)** paper: ACM pages returned errors; only a summary and the abstract through [18] were read.
- **Wiley pages** (Joseph & Powell 2022 on a specialist typeface; Suttle et al. full text): blocked; Suttle's PubMed abstract was read instead [20].
- **Bonifacci et al. 2022** (TTS and mind wandering in students with dyslexia) and **Keelor et al. 2023** (Annals of Dyslexia, TTS features): seen in search results; results not read, so not used.
- **Hakvoort et al. 2017, Duranovic et al. 2018, O'Brien et al. 2005, van den Boer & Hakvoort 2015, Bachmann 2013**: described only as reported in [4] and [5]; not opened.
- **Lexend's licence and peer-review status**: licence is OFL per a GitHub listing in search results (not opened); the lexend.com demonstration page I read (about 200 of 270 lines) gives no peer-reviewed source, and its "nearly 70% of the population experiences some reading difficulty" attribution to the US Department of Education was not checked [14].
- **Atkinson Hyperlegible Next** (Braille Institute press release, 10 February 2025): in search results only. Any independent study of Atkinson Hyperlegible: none found in the one search run.
- **Voice Dream Reader price**: a third-party paywall listing gives $79.99/year and $4.99/month, but it is undated and I could not confirm it first-party; a user review says the developer disabled lifetime purchases (not verified). **NaturalReader** plans beyond Lite and **Helperbird Pro** pricing were not read. **Dyslexie** font price and licence not checked.
- **Whether Chrome desktop's Google voices have since gained boundary events**: [40] is dated to April 2024 for several figures and I did not test voices.
- **Immersive Reader's status**: the Azure documentation page I read shows an update date of 9 September 2026 and no retirement notice; a search for a retirement announcement returned nothing relevant, but that is not proof it is not planned.
- **Evidence for sepia backgrounds and for word-versus-sentence highlighting**: none found in the searches run.

## Sources

1. Wery, J. J., & Diliberto, J. A. (2017). The effect of a specialized dyslexia font, OpenDyslexic, on reading rate and accuracy. *Annals of Dyslexia*, 67(2), 114–127. Abstract, introduction, method and part of results read. https://pmc.ncbi.nlm.nih.gov/articles/PMC5629233/
2. Zorzi, M., et al. (2012). Extra-large letter spacing improves reading in dyslexia. *PNAS*, 109(28), 11455–11459. Full text read. https://pmc.ncbi.nlm.nih.gov/articles/PMC3396504
3. Marinus, E., et al. (2016). A special font for people with dyslexia: Does it work and, if so, why? *Dyslexia*, 22(3), 233–244. PubMed record. https://pubmed.ncbi.nlm.nih.gov/27194598
4. Kuster, S. M., et al. (2018). Dyslexie font does not benefit reading in children with or without dyslexia. *Annals of Dyslexia*, 68(1), 25–42. Abstract, introduction and literature review read. https://link.springer.com/article/10.1007/s11881-017-0154-6
5. Galliussi, J., et al. (2020). Inter-letter spacing, inter-word spacing, and font with dyslexia-friendly features. *Annals of Dyslexia*, 70, 141–152. Full text read. https://link.springer.com/article/10.1007/s11881-020-00194-x
6. Azzarello, C., et al. (2026). Does font improve reading in dyslexic children? Meta-analysis of dyslexia-friendly fonts. *Annals of Dyslexia*, 76, 635–657. Abstract and reference list only (paywalled). https://link.springer.com/article/10.1007/s11881-026-00389-8
7. International Dyslexia Association (2018). Do special fonts help people with dyslexia? *The Examiner*, 7(1). https://dyslexiaida.org/do-special-fonts-help-people-with-dyslexia/
8. Rello, L., & Baeza-Yates, R. (2013). Good fonts for dyslexia. *ASSETS '13*. Abstract, method and first results read. https://www.changedyslexia.org/publications/pdfs/2013-ASSETS-Good%20Fonts%20for%20Dyslexia.pdf
9. Schneps, M. H., et al. (2013). E-readers are more effective than paper for some with dyslexia. *PLoS ONE*, 8(9), e75634. https://pmc.ncbi.nlm.nih.gov/articles/PMC3776763
10. Schneps, M. H., et al. (2013). Shorter lines facilitate reading in those who struggle. *PLoS ONE*, 8(8), e71161. PubMed record. https://pubmed.ncbi.nlm.nih.gov/23940709
11. Joo, S. J., White, A. L., Strodtman, D. J., & Yeatman, J. D. (2018). Optimizing text for an individual's visual system. *Cortex*, 103, 291–301. Abstract as quoted by Readability Matters. https://readabilitymatters.org/articles/the-impact-of-visual-crowding-on-reading
12. Sheppard, S. M., et al. (2023). One font doesn't fit all. *Education Sciences*, 13(9), 864. Abstract read. https://digitalcommons.chapman.edu/comm_science_articles/39/
13. Alexeeva, S., Zubov, V., & Konina, A. (2022). The effect of a dyslexia-specific Cyrillic font, LexiaD, on reading speed. *Primenjena psihologija*, 15(2), 199–236. Abstract and introduction read. https://primenjena.psihologija.ff.uns.ac.rs/index.php/pp/article/download/2373/2226
14. Lexend (accessed 2026). *Lexend — Change the way the world reads.* (first-party; about 200 of 270 lines read). https://www.lexend.com/
15. Google Design. *Clean and clear: making reading easier with Lexend.* (first-party case study). https://design.google/library/lexend-readability
16. Braille Institute (accessed 2026). *Read easier with our family of Hyperlegible fonts.* (first-party). https://www.brailleinstitute.org/freefont
17. OpenDyslexic (accessed 2026). *OpenDyslexic: a typeface for dyslexia.* https://opendyslexic.org/
18. Niklaus, A. G., Cai, T., Bylinskii, Z., & Wallace, S. (2023). Digital reading rulers. *CHI '23*. Abstract and summary as presented by Readability Matters. https://readabilitymatters.org/articles/research-highlight-digital-reading-rulers
19. Wood, S. G., Moxley, J. H., Tighe, E. L., & Wagner, R. K. (2018). Does use of text-to-speech and related read-aloud tools improve reading comprehension for students with reading disabilities? A meta-analysis. *Journal of Learning Disabilities*, 51(1), 73–84. ERIC abstract. https://eric.ed.gov/?id=EJ1164251
20. Suttle, C. M., Lawrenson, J. G., & Conway, M. L. (2018). Efficacy of coloured overlays and lenses for treating reading difficulty: an overview of systematic reviews. *Clinical and Experimental Optometry*, 101(4), 514–520. PubMed record. https://pubmed.ncbi.nlm.nih.gov/29633383
21. Piepenbrock, C., Mayr, S., Mund, I., & Buchner, A. (2013). Positive display polarity is advantageous for both younger and older adults. *Ergonomics*, 56(7), 1116–1124. PubMed record. https://pubmed.ncbi.nlm.nih.gov/23654206
22. Budiu, R. (2020). Dark mode vs. light mode: which is better? Nielsen Norman Group. Summary only. https://www.nngroup.com/articles/dark-mode/
23. W3C. *Understanding Success Criterion 1.4.12: Text Spacing (WCAG 2.2).* https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html
24. Microsoft Learn. *What is Azure AI Immersive Reader?* (page metadata: updated 2026-09-09). https://learn.microsoft.com/en-us/azure/ai-services/immersive-reader/overview
25. Microsoft Support. *Boost reading comprehension with Learning Tools.* (first-party). https://support.microsoft.com/en-us/education/student-help-center/boost-reading-comprehension-with-learning-tools
26. Jarke, H., et al. (2020). *Evaluation of a technology-based intervention for reading in UK classroom settings.* RAND Europe, RR-4208. https://www.rand.org/pubs/research_reports/RR4208.html
27. Microsoft Support. *Use Reading mode in Microsoft Edge.* https://support.microsoft.com/en-us/edge/use-immersive-reader-in-microsoft-edge
28. Google Chrome Help. *Use reading mode in Chrome.* https://support.google.com/chrome/answer/14218344
29. Apple Support. *Hide distractions when reading articles in Safari on Mac.* https://support.apple.com/guide/safari/hide-distractions-when-reading-sfri32632/mac
30. Apple Support. *Use Apple Intelligence in Safari on Mac.* https://support.apple.com/guide/mac-help/use-apple-intelligence-in-safari-mchl62d5873e/26/mac/26
31. Thurrott, P. (2024). Firefox 129 delivers improved Reader View, more. (secondary report of Mozilla's release notes.) https://www.thurrott.com/cloud/web-browsers/mozilla-firefox/306739/firefox-129-delivers-improved-reader-view-more
32. Speechify (accessed 2026). *Pricing.* (first-party). https://speechify.com/pricing
33. NaturalReader Help Center. *Plans & pricing (personal version).* (first-party; Lite plan read). https://help.naturalreaders.com/en/articles/8854700-plans-pricing-personal-version
34. Read Aloud (2026). *New in Read Aloud: Reader Mode, Google Natural voices and Pocket TTS.* (first-party). http://blog.readaloud.app/2026/10/new-in-read-aloud-reader-mode-and.html
35. Chrome Web Store. *Read Aloud: A Text to Speech Voice Reader.* https://chromewebstore.google.com/detail/read-aloud-a-text-to-spee/hdhinadidafjejdhmfkjgnolgimiaplp
36. Voice Dream (accessed 2026). *Voice Dream Reader.* (first-party). https://www.voicedream.com/
37. Helperbird (accessed 2026). *Accessibility and productivity features.* (first-party). https://www.helperbird.com/features
38. Chrome for Developers. *Summarizer API.* https://developer.chrome.com/docs/ai/summarizer-api
39. Chrome for Developers. *Translator API.* https://developer.chrome.com/docs/ai/translator-api
40. Readium. *SpeechSynthesis in browsers and OSes.* https://readium.org/speech/docs/WebSpeech.html
41. MDN. *SpeechSynthesisUtterance: boundary event.* https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisUtterance/boundary_event
42. Buzzline repository (read locally, not modified): `src/content.js` (Reader overlay and read-aloud, ~lines 519–603), `src/content.css` (Reader styles), `src/pdf.html` (reflow styles, `--size`).
43. Buzzline, `docs/research/colour-schemes.md` (sections 4 and 5: dark pages, dyslexia and visual stress).
