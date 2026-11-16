# Reading apps, devices and habits: what Buzzline could borrow

Area: read-it-later and reader apps, e-readers and e-ink devices, focus and distraction hacks, active-reading features, and the retention evidence behind them. Research date: 16 November 2026. Every claim carries a URL I opened, or is labelled. "Search snippet" means I saw the text in a search result but could not open the page. `[INFERENCE]` marks my own reasoning.

Note from Main that I applied: Buzzline's Reader overlay already has paragraph-level read-aloud (speechSynthesis, current paragraph highlighted, Stop). I only list speech ideas that go beyond that.

## Summary

The read-it-later market was reshaped in 2024-25: Omnivore's hosted service closed and Pocket shut down, which left Readwise Reader (paid, AI-heavy), Instapaper (cheap, "no AI") and a self-hosted scene. The big 2025-26 trend is "ask the book": Kindle's *Ask This Book* reached Kindle devices in late October 2026, Readwise shipped library-wide chat and LLM word lookup, and Chrome ships Gemini in a side panel. The research does not support most of the habit tooling people love. Highlighting and rereading are rated low-utility, while retrieval practice and spaced practice are rated high-utility. Screens cost some comprehension on informational text, and screen readers overestimate how much they understood. Buzzline's best opportunities are therefore small, local, no-account features that push readers toward retrieval and calibration, not another highlighter or chatbot: an end-of-read self-test, honest time-left with progress, and select-to-define.

## What the research says (used throughout)

| Question | Finding | Who/what was studied | Strength |
|---|---|---|---|
| Which study techniques work? | Practice testing and distributed practice rated **high** utility; highlighting/underlining, rereading and summarisation rated **low** ([APS summary of Dunlosky et al. 2013](https://www.psychologicalscience.org/news/releases/which-study-strategies-make-the-grade.html)) | Review of 10 techniques, mostly lab and classroom studies | Strong review; says benefits need motivated learners |
| Does the user's own highlighting help? | Learner-generated highlighting: memory effect 0.36, comprehension 0.20; instructor-provided highlighting 0.44 for both. 36 articles, 85 effect sizes ([Ponce, Mayer & Méndez 2022, abstract](https://link.springer.com/article/10.1007/s10648-021-09654-1)). A blog summary of the paper says reviewing highlights did not help ([Learning & the Brain](https://www.learningandthebrain.com/blog/getting-the-details-just-right-highlighting/)); I could not check that in the full text | College and school students reading academic text | Moderate (meta-analysis); the "reviewing" claim is second-hand |
| Does testing beat restudying? | Hedges g = 0.50, CI [0.42, 0.58] for testing vs restudy ([Rowland 2014, read from PDF copy](https://courseware.epfl.ch/assets/courseware/v1/fdde2f0aa590bf3b1324077a6bf1540c/asset-v1:EPFL+DEMO+2020+type@asset+block/Rowland2014-meta-analysis.pdf)) | Lab studies, many materials | Strong |
| Does it work on prose? | After 5 min, restudy recalled more; after 2 days and 1 week, testing recalled "substantially" more, and restudying raised confidence ([Roediger & Karpicke 2006](https://learninglab.psych.purdue.edu/downloads/2006/2006_Roediger_Karpicke_PsychSci.pdf)) | Students reading prose passages, free-recall tests | Strong for the effect, small lab sample |
| Paper vs screen | Screens worse: g = -0.25 overall, -0.32 for informational text, -0.04 for narrative; no reliable reading-time difference; paper readers judged their own performance more accurately (g = 0.20). 33 studies, n = 2,799 ([Clinton 2019, abstract via Crossref](https://api.crossref.org/works/10.1111/1467-9817.12269)). A separate 2018 meta-analysis found g = -0.21 ([TUM summary of Delgado et al.](https://www.edtech.tum.de/dont-throw-away-your-printed-books-why-reading-performance-is-better-on-paper-than-on-screens/)); [Hechinger Report](https://hechingerreport.org/evidence-increases-for-reading-on-paper-instead-of-screens/) notes the studies did not test digital extras such as definitions or quizzes | Randomised lab studies, mostly students | Moderate; small effect, informational text only |
| E-ink vs LCD | LCD tablet caused more visual fatigue than e-ink or paper; e-ink looked like paper ([Benedetto et al. 2013](https://pubmed.ncbi.nlm.nih.gov/24386252)) | Three prolonged sessions on Kindle Fire HD, Paperwhite, paper | Moderate-weak (one study) |
| Light-emitting reader at bedtime | Longer to fall asleep, reduced melatonin, later circadian timing vs printed book ([Chang et al. 2015, PNAS](https://pubmed.ncbi.nlm.nih.gov/25535358/)) | Lab crossover, light-emitting e-reader vs print | Moderate (small controlled study) |
| Reading while listening | Overall g = 0.18 ("trivial"); benefit limited to experimenter-paced reading (g = 0.41), none when self-paced (g = 0.06, CI crosses 0). 30 studies, N = 1,945 ([Clinton-Lisell 2023](https://files.eric.ed.gov/fulltext/EJ1403866.pdf)) | Adults and children, mixed | Moderate |
| LLM answers vs searching | Learning from LLM summaries produced shallower knowledge, even when links were added. Seven experiments, n = 10,462 ([Melumad & Yun 2025](https://pubmed.ncbi.nlm.nih.gov/41163786/)) | Online and lab participants learning about a topic | Moderate; studied topic research, not document Q&A |
| How fast do adults read? | Silent reading averages 238 wpm for non-fiction and 260 wpm for fiction; 175-300 wpm is the normal non-fiction range. 190 studies, 18,573 participants ([Brysbaert 2019, read from PDF copy](https://gwern.net/doc/psychology/linguistics/2019-brysbaert.pdf)) | Meta-analysis | Strong |
| Glosses | Large effects on **second-language vocabulary** (d = 1.40 Abraham 2008; g = 1.27 Mohsen 2024; g = 0.83 two others), quoted in a [2024 meta-analysis intro (search snippet)](https://www.sciencedirect.com/science/article/pii/S000169182400218X) | L2 learners | Strong for L2 vocabulary; none found for native adult comprehension |
| Streak displays | Seven experiments, 4,000+ participants on streak highlighting ([INSEAD summary](https://knowledge.insead.edu/marketing/consumer-streaks-are-motivating-key-keeping-them-alive)); a field study highlighting streaks for Peruvian 4th-6th graders on a math platform ([title and IADB summary only](https://publications.iadb.org/publications/english/document/Research-Insights-How-Can-Behavioral-Nudges-Be-Leveraged-to-Boost-Student-Effort-and-Achievement.pdf)) | Consumers; children on a math platform | Moderate that streaks raise *activity*; none found for reading |

## Master table: every app, device and feature found

Effort: **S** about a day, **M** about a week, **L** more. Evidence: how strongly independent sources show the feature helps reading or retention, not whether people like it.

| Name | What it does | Evidence strength | Effort for Buzzline | Fit (extension and PDF) |
|---|---|---|---|---|
| Readwise Reader | Read-it-later, highlights, notes, PDFs/EPUBs, RSS, TTS, Ghostreader AI | Marketing only; no independent study found | L | Different product; borrow ideas only |
| Readwise Highlights: Daily Review and Mastery | Resurfaces highlights daily; turns them into Q&A or cloze cards on a "soon/later/someday" schedule | Mechanism matches retrieval and spacing evidence; no independent study of the product | M-L | Needs local store; no backend; PDF text OK |
| Ghostreader (chat, Define, Term lookup, Global) | LLM chat on the document, context-aware definitions, library-wide cited answers | None found for retention; related LLM study is negative | L | Needs a model API; privacy cost |
| Instapaper | Parsed reader, notes, TTS, Kindle/Kobo send; Premium $5.99/mo or $59.99/yr | None found | n/a | Competitor/benchmark |
| Pocket | Shut down 2025 | n/a | n/a | Dead |
| Matter | iOS/web reader, audio highlights, quoteshots, transcribed podcasts/video | None found | n/a | Competitor |
| Omnivore | Hosted service closed 2024; code still public | n/a | n/a | Dead service |
| Raindrop.io | Bookmark manager with highlights; free tier | None found | n/a | Competitor |
| wallabag, Readeck, Karakeep, Linkwarden | Self-hosted save-and-read tools | None found | n/a | Export target at most |
| Glasp (web/PDF highlighter) | Free highlight-and-note extension for Chrome, Safari, Edge, Firefox | None found; highlighting itself is low-utility | L | Direct competitor in your extension category |
| Kindle X-Ray | Tap a name to be reminded who/what it is | None found | M | Needs per-page entity index |
| Kindle Word Wise | Short inline definitions above hard words | L2 gloss evidence only | M | Inline text insertion is fiddly |
| Kindle Recaps / Story So Far | Spoiler-free "previously on" summary, generated | None found | L | Needs LLM; fiction-centric |
| Kindle Ask This Book | AI Q&A on the passage you select, spoiler-aware | None found; negative reader and author reaction | L | Needs LLM; legal risk shifts to you |
| Apple Books Reading Goals | Daily goal ring, streak, books-per-year goal | Streak evidence is for activity, not reading | M | Needs reading-time tracking |
| Kindle Reading Insights | Reading time/streak stats | None found; not verified from Amazon | M | Same as above |
| Libby Timeline and smart tags | Reading history and automatic lists | None found | n/a | Library-specific |
| Libby AI Content Controls | Filter titles by AI text/audio/graphics/translation | n/a | n/a | Out of scope |
| Kindle Scribe / Scribe Colorsoft | 11-inch e-ink with pen, AI notebook search | E-ink fatigue evidence only | n/a | Cannot run extensions |
| Kindle 2026 range (Colorsoft, Paperwhite) | Page-turn buttons back; Ask This Book arriving | n/a | n/a | Cannot run extensions |
| Boox Go 10.3 Gen II, Palma 2 Pro | Android e-ink; install any reading app; warm/cool light | E-ink fatigue evidence only | S (check) | Runs Android browsers; extension support `[INFERENCE]` unverified |
| reMarkable Paper Pure / Paper Pro Move | Writing-first e-ink tablets | None found | n/a | Not a browser target |
| Kobo (Libra Colour, Instapaper integration) | E-ink readers; Instapaper replaced Pocket | n/a | n/a | Instapaper is the send target |
| Send to Kindle (Chrome extension, email, web) | Sends web articles/PDFs/EPUBs to a Kindle | n/a | M for an EPUB export | Strong fit; Reader overlay already extracts text |
| Chrome Reading mode | Distraction-free view, fonts, spacing, link/image hiding, line focus, voice picker and highlight | Reader-mode benefit: none found | n/a | Free built-in competitor |
| Firefox Reader View | Clutter-free page, read aloud | None found | n/a | Built-in competitor |
| Safari Distraction Control | Hide chosen page elements | None found | M | Per-site element hiding is doable |
| Readwise Reader Focus mode | Greys out paragraphs that are not the current one | None found | S-M | Close to Buzzline's gradient idea |
| Site blockers (Freedom, Cold Turkey, LeechBlock NG, StayFocusd) | Block sites on a schedule | Meta-analysis exists, effect size not retrieved | n/a | Mature and free; out of scope |
| Scheduled reading sessions | If-then plans for when to read | Moderate (implementation-intention meta-analysis) | S | Needs alarms permission |
| Time-left / progress options | Percent, page, time left in chapter or book | None found | S | Straightforward |
| Streaks and goals | Daily goal ring, streak count | Raises activity; no reading-specific data found | M | Needs reading-time measurement |
| Inline definitions (select-to-define) | Dictionary or LLM definition on selection | L2 vocabulary: strong; native adults: none found | S-M | Works on page and pdf.js text layer |
| Auto-glossary / term lookup | Author's use of a term, gathered from the document | None found | M-L | Needs LLM or heuristics |
| Chapter summaries / "ask the text" in browsers | Gemini in Chrome side panel, Comet, Dia | Negative evidence on shallower learning | L | Competes with browser vendors |
| Mnemonic medium (Quantum Country) | Questions embedded in an essay plus emailed spaced review | Self-reported data; MOOC replication null | L | Needs authored questions |
| Read-aloud upgrades | Word highlight, voice and speed picker, better voices | Trivial for self-paced reading | S-M | Page and PDF reader |
| Margin notes | Notes tied to a passage | Not isolated in the studies I found | L | Needs persistence |

## Promising items

### 1. End-of-read self-test (retrieval prompt)

- **What exists:** Readwise Mastery turns a highlight into a Q&A or cloze card; each review asks "soon, later or someday" ([docs](https://docs.readwise.io/highlights/guides/mastery)). Quantum Country embeds questions in the essay and emails reviews. I found no product that offers a lightweight one-shot recall prompt on arbitrary web pages.
- **Who uses it / cost:** Readwise users; Highlights-only is $8.99/month, Full Readwise $12.99/month ([pricing page](https://readwise.io/pricing/reader?period=monthly)). Quantum Country is free essays.
- **Evidence:** Strongest in this document. Testing beat restudy at g = 0.50 (Rowland) and the prose result holds at two days and a week (Roediger & Karpicke). Screen readers are also less accurate about their own comprehension (Clinton), so a recall prompt targets a known screen weakness. Caveats: adoption is poor when it is optional. In one MOOC experiment about 80% of people offered review questions never touched them, and grades showed no detectable difference ([secondary synthesis](http://quidproquo.cc/posts/learning/2026-10-14-spaced-review-in-teaching-articles-en/)). The Quantum Country author rates his own causal evidence as only "emerging" ([his note](https://notes.andymatuschak.org/zqetsQERteJhyPitmRoaeE)).
- **Effort for Buzzline: M.** Offer a prompt after Sprint ends or the Reader closes: free-recall box, then reveal the passage or a cloze version (hide one salient word per sentence, no LLM). Keep scheduling out; a single session is the cheap, testable part.
- **Fit:** Works on page text and on the PDF Reader view. No account or server.

### 2. Time left, progress and a personal reading rate

- **What exists:** Readwise Reader lets EPUB readers show percent, page number, time left in chapter, time left in book, or nothing ([Aug 2026 update](https://blog.readwise.io/update-aug2026)).
- **Evidence:** None found that time estimates improve reading. The one solid number is the baseline: 238 wpm non-fiction, 260 fiction (Brysbaert). Buzzline already holds a user-chosen Sprint WPM, which is a better personal estimate than a fixed constant `[INFERENCE]`.
- **Effort: S.** Show "about N min left" in the Reader overlay and a thin progress bar.
- **Fit:** Page: scroll position. PDF: page number plus pdf.js text length.

### 3. Select-to-define and term lookup

- **What exists:** Kindle Word Wise puts short definitions above hard words ([Amazon](https://www.amazon.com/gp/help/customer/display.html?nodeId=201645250)). Readwise Quick Lookup (mobile) gives context-specific meaning, a "term" lookup built from the author's usage in the document, and translation; it needs a connection ([update](https://blog.readwise.io/update-aug2026)). The same post cites Adler's *How to Read a Book* on "coming to terms."
- **Evidence:** Strong for second-language vocabulary (see table). For native adults reading informational text I found none. Furenes et al. 2021 reported an embedded dictionary had no or negative effect on children's story comprehension but helped vocabulary ([search snippet](https://journals.sagepub.com/doi/full/10.3102/0034654321998074)). Clinton said the lab studies gave screens no extras, so digital aids are untested ([Hechinger](https://hechingerreport.org/evidence-increases-for-reading-on-paper-instead-of-screens/)).
- **Effort: S-M.** Dictionary on double-click or selection needs an external lookup source; I did not research which free source to use. An LLM version is **L** and brings the risks in section 6.
- **Fit:** Page and pdf.js text layer both support selection.

### 4. Streaks and goals, done gently

- **What exists:** Apple Books has a daily progress ring, streak record and yearly books goal ([Apple](https://www.apple.com/apple-books)). Readwise Daily Review has streaks, and 2.0 added a "completion screen worthy of your streak" ([update](https://blog.readwise.io/update-aug2026)). Libby's sister app Sora shows reading streak and total reading time ([Sora help snippet](https://help.soraapp.com/en-us/5091.htm)). Good e-Reader claims iOS 27 adds "daily coaching" to Reading Goals ([secondary, not confirmed by Apple](https://goodereader.com/blog/e-book-news/apple-books-gets-a-few-new-features-in-ios-27)).
- **Evidence:** Streak displays raise persistence in experiments and a school field study (INSEAD, IADB summaries), but the topic there was shopping, work tasks and math, not reading. Third-party posts warn that a visible streak can start deciding *what* people read ([OneGoal](https://onegoal.team/guides/when-a-kindle-reading-streak-starts-choosing-the-reading/when-the-kindle-streak-enters-the-reading-decision)); that is a blog, not a study.
- **Effort: M.** Needs honest "active reading time" detection (scroll, focus, Sprint running) and storage. Gaming risk: reading time on a tab left open.
- **Fit:** Extension can count per-day time. PDF reader can count the same.

### 5. Per-site "hide this" (Safari Distraction Control)

- **What exists:** Safari lets you tap to hide page elements ([How-To Geek](https://www.howtogeek.com/every-safari-user-should-change-these-settings-now)). Chrome Reading mode can hide links and images ([Chrome Help](https://support.google.com/chrome/answer/14218344?hl=en)).
- **Evidence:** Hyperlinks and navigation add cognitive load in hypertext (reviews such as [DeStefano & LeFevre 2007](https://www.sciencedirect.com/science/article/pii/S0747563205000658); I read only the listing). Results depend on link structure. I found no study of hiding sidebars or comments.
- **Effort: M.** Persist a selector per host; breakage on SPAs is the cost.
- **Fit:** Page only; the Reader overlay is already a distraction-free view.

### 6. "Ask the text" and AI summaries: a caution, not a pick

- **What exists:** Kindle *Ask This Book* (iOS app Dec 2025; Kindle devices with software 5.20.2 from late Oct 2026, reported on 2026 models, possibly US-only) ([PCMag](https://au.pcmag.com/ebook-readers/114788/kindles-new-ai-feature-can-answer-questions-about-your-books-whether-authors-want-it-or-not), [TechRadar](https://www.techradar.com/tablets/ereaders/amazons-ask-this-book-feature-is-finally-rolling-out-to-kindles-but-certain-models-and-regions-may-be-excluded)). Readwise Global Ghostreader answers with citations across a library and is "fully agentic" ([update](https://blog.readwise.io/update-aug2026)). Gemini in Chrome summarises or explains from a side panel ([Google, 12 Nov 2026](https://blog.google/innovation-and-ai/products/gemini-app/research-with-gemini-in-chrome/)).
- **Evidence and risk:** No study of retention from these features found. Melumad & Yun found shallower knowledge from LLM syntheses. Amazon gave authors no opt-out and did not explain hallucination handling or licensing (PCMag). TechRadar quotes Reddit reactions such as "I hate it." Readwise itself says earlier "chat with PDF" experiences "abstract away the underlying act of reading" and says it tries to keep reading central ([update](https://blog.readwise.io/update-aug2026)). Readwise also published an [AI policy](https://readwise.io/ai-policy).
- **Effort: L** plus ongoing cost, key handling and privacy review. Browser vendors now ship this for free.
- **Verdict:** Do not build chat. If anything, build the opposite: prompts that make the reader produce something (item 1).

### 7. Read-aloud upgrades beyond today's paragraph highlight

- **What exists:** Chrome Reading mode lets you pick a voice and speed and highlight by word, sentence or "adaptive" ([Chrome Help](https://support.google.com/chrome/answer/14218344?hl=en)). Instapaper Premium lists AI voices ([page](https://www.instapaper.com/premium)). Readwise says better TTS voices are coming ([update](https://blog.readwise.io/update-aug2026)).
- **Evidence:** Reading while listening helps only a little overall and not at all when the reader sets the pace (Clinton-Lisell). Sprint is machine-paced, so audio could matter there more than on the scrolling page `[INFERENCE]`; I found no RSVP-with-audio study.
- **Effort: S-M** for word highlight plus voice and speed picker; speaking from the coloured page and the PDF Reader is the Buzzline-specific gap.
- **Fit:** Page and PDF text layers both usable.

### 8. Send to Kindle/Kobo/Boox export

- **What exists:** Amazon's [Send to Kindle](https://www.amazon.com/gp/help/customer/display.html?nodeId=G5WYD9SAF7PGXRNA) takes web content by Chrome extension, web upload or email at no cost. Kobo replaced Pocket with Instapaper in 2025 ([Engadget](https://www.engadget.com/mobile/tablets/kobo-ereaders-are-swapping-out-pocket-for-instapaper-190615508.html)). Instapaper's Kindle sending is a Premium feature ([page](https://www.instapaper.com/premium)).
- **Evidence:** None needed for transport; the e-ink argument is eye strain and sleep (Benedetto, Chang). Boox Palma 2 Pro reviewer says it got her off her phone, which is one person's report ([TechCrunch](https://techcrunch.com/2026/10/24/the-boox-palma-2-pro-finally-got-me-to-stop-reading-on-my-phone)).
- **Effort: M.** Build EPUB or PDF from `BuzzlineReading.extract()`. Colour gradients would not survive grayscale e-ink; a plain export is the realistic form `[INFERENCE]`.
- **Fit:** Page via Reader extraction; PDF reflow already exists in Reader view.

## What the landscape looks like (reference)

**Readwise Reader.** Pricing page (opened): Full Readwise $12.99/month billed monthly, Reader-only $8.99, Highlights-only $8.99; 30-day trial; 50% academic discount ([pricing](https://readwise.io/pricing/reader?period=monthly)). A third-party review quotes $7.99/$9.99 for annual billing, which conflicts with monthly pricing on the page I opened. Aug 2026 update: Global Ghostreader, Quick Lookup, MCP/CLI, mobile chat, Readwise 2.0 app, Focus mode fixed, "better TTS voices" and "reading themes" planned, and "one more thing... not AI" teased ([update #14](https://blog.readwise.io/update-aug2026)). Daily Review mechanics are in the [docs](https://docs.readwise.io/readwise/docs/faqs/reviewing-highlights).

**Instapaper.** Free: unlimited saves, five notes a month. Premium $5.99/month or $59.99/year: full-text search, PDFs, permanent archive, unlimited notes, Kindle integration, AI voices, and a "speed reading... up to 3x faster" claim I could not evaluate ([page](https://www.instapaper.com/premium)). A Marqly review notes there is no AI ([review](http://www.marqly.com/blog/instapaper-review-2027)).

**Pocket.** Mozilla announced the phase-out; the farewell page confirms the web, Android, iOS, macOS apps and browser extensions are gone ([farewell](https://getpocket.com/farewell)). Mozilla's help page (search snippet, page blocked) says data export was disabled on 12 Nov 2025 and data queued for deletion ([Mozilla](https://support.mozilla.org/en-US/kb/future-of-pocket)).

**Omnivore.** Team joined ElevenLabs 29 Oct 2024 ([ElevenLabs](https://elevenlabs.io/blog/omnivore-joins-elevenlabs)); wallabag says data would be deleted at the end of November ([wallabag](https://wallabag.org/news/20241031-migrate-from-omnivore)). The AGPL repo is not archived and was pushed to on 14 Nov 2026 (GitHub API, 16.4k stars), so the code is alive but the hosted service is not.

**Matter.** iOS and web only; transcribes podcasts and video; audio highlights; quoteshots ([site](https://www.getmatter.com/)). Pricing from third-party sites: $8/month or $60/year ([Textivore](https://textivore.com/blog/matter-app-pricing-2026)), not confirmed on Matter's own page.

**Raindrop.io.** Free tier: unlimited bookmarks, collections and highlights ([pricing](https://raindrop.io/pro/buy)). Pro at $28/year is from a third-party review ([Marqly](https://www.marqly.com/blog/raindrop-review-2027)).

**Self-hosted.** Readeck, wallabag, Karakeep, Linkwarden all appear in 2026 roundups ([Big Iron](https://www.bigiron.cc/guides/the-self-hosted-pocket-replacement-stack-2026)); I did not open the projects.

**Kindle devices and e-ink.** Kindle Scribe (3rd gen) and Scribe Colorsoft announced 30 Sept 2025, shipped 10 Dec 2025; Scribe with front light $499.99, without $429.99 ([TechCrunch](https://techcrunch.com/2025/12/04/amazon-unveils-new-kindle-scribe-and-kindle-scribe-colorsoft)); Colorsoft $630 ([Ars Technica](https://arstechnica.com/gadgets/2025/12/kindle-scribe-colorsoft-brings-color-e-ink-to-amazons-11-inch-e-reader/)). Amazon calls out no apps or notifications and weeks of battery ([Amazon](https://www.aboutamazon.com/news/devices/new-amazon-kindle-scribe-color)). Boox: Palma 2 Pro $400, warm/cool front light, Android with Google Play, ghosting, 5-7 day battery; Palma 3 at $340 coming ([TechCrunch](https://techcrunch.com/2026/10/24/the-boox-palma-2-pro-finally-got-me-to-stop-reading-on-my-phone)). ZDNET rated the Boox Go 10.3 Gen 2 3/5 with a "steep learning curve" and compared it with reMarkable Paper Pure, both starting at $399 ([ZDNET](https://www.zdnet.com/article/boox-go-10-3-gen-2-lumi-review), [comparison](https://www.zdnet.com/article/boox-go-10-3-remarkable-paper-pure-comparison)). What people value, from these reviews: no distractions, soft or warm front light, light weight, long battery; page-turn buttons are back on Kindle 2026 models per [PCMag's headline](https://au.pcmag.com/ebook-readers/114788/kindles-new-ai-feature-can-answer-questions-about-your-books-whether-authors-want-it-or-not) (I did not open that piece).

**Site blockers.** Freedom has a free plan with sessions up to two hours ([site](https://freedom.to/)); Cold Turkey has a free tier and a $45 one-time Pro, per a [third-party comparison](https://usecactus.app/compare/cold-turkey-vs-freedom). LeechBlock NG and StayFocusd are extensions in the same roundups ([browsers.to](https://browsers.to/extensions/focus)). A [meta-analysis of digital self-control tools](https://dl.acm.org/doi/full/10.1145/3571810) exists; its abstract says real effectiveness is "limited" in understanding, and I did not retrieve the effect size.

**Scheduled reading.** Implementation intentions ("if situation Y, then I will do Z") were found effective for starting goal-directed behaviour in a large meta-analysis ([Gollwitzer & Sheeran 2006, abstract](http://psycnet.apa.org/record/2007-19538-002)). I did not retrieve its effect size, and it was not about reading specifically.

## Top three picks for Buzzline

1. **End-of-read self-test (free recall, then cloze reveal).** It has the best evidence in this area (Rowland g = 0.50; Roediger & Karpicke's prose result), and it targets the screen overconfidence that Clinton measured. It needs no account, server or model, and it reuses text Buzzline already extracts. Keep it opt-in and one prompt long: the same sources show optional review prompts get skipped, so measure completion before adding scheduling.
2. **Time left, progress and a personal reading rate.** It is a day of work, it makes Sprint and Reader feel purposeful, and Brysbaert's 238 wpm gives an honest default that Buzzline's own WPM setting can refine. The honest label is "cheap and liked", not "proven": I found no independent evidence that estimates change outcomes.
3. **Select-to-define with a plain dictionary first.** Every major reader has it and Buzzline has none. The L2 gloss evidence is strong, and for native adults it is merely harmless. Avoid starting with an LLM definition: that brings cost, privacy and the shallow-learning risk, while a dictionary lookup does not.

Runners-up: gentle streaks (needs reading-time measurement first), per-site hide, and EPUB export for e-ink. Skip chat, library-wide AI, site blocking and spaced-repetition scheduling: they are costly, crowded or have the weakest adoption.

## Could not verify

- **Mozilla's Pocket help page** was blocked by a client challenge; shutdown and export dates come from a search snippet and [one third-party post](https://linkmartin.com/blog/pocket-alternatives).
- **Omnivore's own shutdown post** failed to load; I used ElevenLabs, wallabag and the GitHub API. The GitHub `pushed_at` date shows activity, not who is maintaining it.
- **Wiley (Clinton 2019), PsycNet (Rowland) and ScienceDirect (Brysbaert, Peru streak study)** blocked automated access. Clinton's abstract came from Crossref; Rowland and Brysbaert from PDF copies; the Peru study I only saw as a title and IADB summary.
- **Delgado et al. 2018** abstract not opened; g = -0.21 comes from the TUM summary and the Hechinger report. Two figures from an AI-written search answer (study count, time-limit result) were not used.
- **Ponce 2022 "reviewing highlights doesn't help"** is from a blog summary, not the paper.
- **Streak research:** INSEAD summary and IADB summary only; no reading-specific study found.
- **Digital self-control meta-analysis and implementation-intention meta-analysis:** abstracts read, effect sizes not retrieved.
- **Prices:** Matter, Raindrop Pro, Cold Turkey and reMarkable Paper Pro Move ($449 in one third-party post) are not from official pages. Kobo's lineup blog and Libby's own AI help page were not opened (the AI details are relayed by a library consortium).
- **Apple Books iOS 27 "daily coaching"** appears only on Good e-Reader; Apple's page I opened shows the existing goals and streak, not the new feature.
- **Kindle Reading Insights and "time left in chapter"** were not checked on Amazon pages.
- **Readwise efficacy:** I found no independent study of Daily Review, Mastery or Ghostreader; the "1,000-day streak" and testimonial lines on their site are marketing. I found no hallucination or accuracy rates for Ghostreader or Ask This Book.
- **Quantum Country numbers** come from the authors' notes (not peer reviewed) and a secondary critical synthesis ([quidproquo.cc](http://quidproquo.cc/posts/learning/2026-10-14-spaced-review-in-teaching-articles-en/)).
- **Free dictionary sources** for select-to-define were not researched.
- **Whether Buzzline runs on Boox browsers**, and how its gradient looks on grayscale or Colorsoft e-ink, are untested `[INFERENCE]`.
- **Hyperlink distraction:** I read titles and snippets of DeStefano & LeFevre 2007 and Blom 2018, not the papers.
