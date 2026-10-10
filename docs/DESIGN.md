# PharmaCore — design direction

This document records the design audit, the three directions that were explored, the one that was chosen, and the
design system that implements it. It is the reference for anyone adding a screen.

## 1. Audit (before the redesign)

**Stack.** React 19 + Vite 6 + Tailwind CSS v4 (`@theme` tokens, `@layer components` classes), react-router 7.
No component or icon library. 17 routed pages inside one `Layout` shell. Shared primitives: `ui.tsx`
(Alert, Badge, StatCard, Modal, ConfirmDialog…), `PageShell.tsx` (PageShell, Panel, ScrollBox), `icons.tsx`
(hand-drawn path set). Real data is a MoPH catalogue of ~11,000 products whose names are long, upper-case registry
strings such as `HYRIMOZ 40mg/0.4ml 2Prefilled pen — Solution for injection`.

**Why it read as a generic admin template**

| Symptom | Where |
| --- | --- |
| Tailwind's default teal on slate, dark `slate-900` sidebar with filled pill for the active item | `index.css`, `Layout` |
| Every region is the same white `rounded-xl` bordered card floating on grey; cards nested in cards | all pages, Reports "Profit" |
| Dashboard and Reports open with rows of KPI cards with coloured left borders | `StatCard` |
| Status shown as rounded pills in four colours (`Expired`, `28 days`, `0 / min 5`) | Dashboard, Products, Backup |
| One typeface for everything; codes, prices, dates and quantities share the body style; dates wrap mid-value (`2026-05-` / `30`) | Inventory, POS |
| Upper-case grey table headers, generous `py-3` rows: ~9 rows per screen on a 900px display | `.data-table` |
| Every page header is "Title + a grey developer sentence" (`FEFO-ready for POS`) | `PageShell` |
| A 7-day bar chart where only one bar has data — decoration, not insight | Reports |
| POS: glowing teal scan box, results list pushes the cart down, payment is a generic form with a `<select>`, tiny grey "Exact" pills, no keyboard model beyond Enter | `POSPage` |
| ~450 hard-coded default-palette classes (`text-slate-500`, `bg-amber-50`…) across 30 files, so pages drift | MoPH, POS, LinkBarcodePanel worst |

**Constraints that shape the redesign.** Offline single workstation (fonts must be bundled, no CDN); keyboard
scanners type into the focused field and press Enter; three roles see different subsets of every page; the backend
already provides everything shown — the redesign must not invent data.

## 2. Three directions

### A. Editorial Precision — "the dispensary ledger"
- **Philosophy.** A pharmacy runs on records: the register, the formulary, the stock book. Treat every screen as a
  well-set page of a reference work — authority through typography and ruling, not through boxes and colour.
- **Palette.** Warm ivory paper, near-black ink, deep forest green for structure and primary action, lime used
  only as a highlighter mark (current item, selected line, the amount to hand back). Oxblood red reserved for
  danger; ochre for caution.
- **Typography.** One superfamily in three voices: IBM Plex Serif for titles and totals, Plex Sans for the
  interface, Plex Mono for codes, barcodes and dates. Tabular figures everywhere numbers align.
- **Layout.** A light index column instead of a dark slab; sections divided by heavy ink rules with small-caps
  labels instead of card borders; content sits on paper sheets with hairlines.
- **Navigation.** Index column grouped like a table of contents; `Ctrl K` "Go to" palette; F-key shortcuts printed
  as keycaps next to the actions they trigger.
- **Tables.** Dense ruled ledgers, right-aligned tabular figures, mono codes, status written in words with a glyph.
- **Data viz.** Typographic: numbers first, inline proportional bars inside tables, no chart cards.
- **Controls.** Rectangular, small 3px radius, ink outlines; segmented controls for mutually exclusive choices.
- **Differentiation.** Looks like a reference book/register, not like SaaS. Risk: can become precious or slow if
  the serif creeps into the working UI — so the serif is limited to titles and totals.

### B. Modern Clinical Instrument — "the dispensing analyser"
- **Philosophy.** Behave like laboratory equipment: calm, exact, state-driven readouts.
- **Palette.** Cool off-white and graphite panels, signal green/amber/red, a dark readout display for totals.
- **Typography.** Technical grotesk with monospaced readouts for every number.
- **Layout.** Fixed panes, a permanent status strip (drawer, backup, rate, API) along the bottom.
- **Navigation.** Icon rail plus command palette; function keys labelled like hardware buttons.
- **Tables.** Grid with column separators, monospaced numerals.
- **Data viz.** Threshold and bullet bars against limits.
- **Controls.** Square, 2px radius, segmented toggles, LED-style status dots.
- **Differentiation.** Feels like equipment. Risk: cold for cashiers, dark readouts drift toward "developer dark
  mode", icon rails hide 15 destinations behind memorisation.

### C. Contemporary Retail Operations — "the counter"
- **Philosophy.** Modern retail POS: speed at the till, touch first, merchandising mindset.
- **Palette.** White with bold brand colour blocks, category colours.
- **Typography.** Rounded humanist sans, large numerals.
- **Layout.** POS as a tile grid of favourite products, bottom action bar.
- **Navigation.** Top tabs, large touch targets.
- **Tables.** Converted to card lists.
- **Data viz.** Big-number tiles and charts.
- **Controls.** Large rounded buttons.
- **Differentiation.** Friendly. Risk: a tile grid is useless for an 11,000-item regulated catalogue sold by scan
  and search; category colours become decoration; card lists destroy inventory density — it slides straight back
  into the generic look this redesign is escaping.

### Decision: A — Editorial Precision ("the dispensary ledger")

It is the only direction that fits both halves of the product: the counter (fast, legible money handling) and the
records (dense, regulated data). The palette hypothesis was tested against it and kept with conditions:

Measured contrast (WCAG formula, `.shots/contrast.mjs`):

- **Ivory + near-black**: body text 15.4:1; secondary `ink-2` 8.7:1; tertiary `ink-3` 5.1:1 on paper (4.6:1 on
  `paper-2`). Kept. `ink-4` (2.9:1) is only for disabled text, never placeholders or labels.
- **Forest green** as primary action fill with ivory text 9.4:1. Kept.
- **Lime** fails as text or thin lines on ivory (1.2:1) and fails as a focus indicator. It is therefore used only
  as a *fill under ink* (13.1:1) or as *text on forest-900* (11.9:1). Focus uses a 2px ink outline (16.8:1).
- **Hairline rules** (1.4:1) only separate content; anything interactive (input borders) uses `line-input`, which
  clears the 3:1 non-text minimum.
- **Red** is reserved for danger, errors, expired stock and destructive actions — never for decoration or brand.

## 3. Design system

All tokens live in `client/src/index.css` (`@theme`). Tailwind's default colour palette is **disabled**
(`--color-*: initial`), so a stray `text-slate-500` produces no colour and is caught in review.

| Group | Tokens |
| --- | --- |
| Paper | `paper-0` sheet `#FCFBF6`, `paper` canvas `#F4F1E7`, `paper-2` index/sunken `#EAE5D6`, `paper-3` pressed `#DDD7C4` |
| Ink | `ink` `#181B16`, `ink-2` `#41453C`, `ink-3` (meta, placeholders) `#646859`, `ink-4` (disabled only, 2.9:1) `#8E907F` |
| Rules | `rule` hairline `#DAD4C2`, `rule-strong` `#B5AE97`, `line-input` field border `#8A8470` (3.6:1 against paper) |
| Forest | `forest-50…900`, primary action `forest-700 #1E4C38`, total band `forest-900 #0F271D` |
| Lime | `lime-200 #E6F3AE`, `lime-300 #D2EA72` (marker), `lime-400 #BEDB4E` |
| Semantic | `danger #A3261B` / `danger-bg #F7E4DF` / `danger-rule #E2B4AA`; `caution #8A5300` / `caution-bg #F6EBCB` / `caution-rule #E0C98A`; success uses forest; info uses ink on `paper-2` |
| Type | `font-serif` Plex Serif (titles, totals, the Today summary), `font-sans` Plex Sans (UI), `font-mono` Plex Mono (codes, barcodes, dates, exchange rate). Sizes: `text-2xs` 11 labels · `text-xs` 12 meta · `text-dense` 13 tables · `text-sm` 14 body · `text-title` 24 page titles · `text-total` 44 the sale total |
| Numbers | tabular lining figures on `body`, so every column of money, quantities and dates aligns; `.num` right-aligns a table cell |
| Radii | `xs` 2px keycaps, `sm` 3px controls, `md`/`lg` 4px sheets and dialogs, `xl` 6px maximum |
| Shadow | none on surfaces; `shadow-overlay` only for dialogs, the command palette and the POS result list |
| Focus | 2px `ink` outline on `:focus-visible`; the scan field adds a lime halo |
| Motion | 120ms colour changes only; spinners stop under `prefers-reduced-motion` |
| Density | table rows ~36px; inputs 36px (44px on touch screens), `input-lg` 52px for the scan field; buttons 36px, `btn-sm` 30px, `btn-lg` 48px |
| Icons | one 24-grid 1.6px-stroke set in `icons.tsx`, used for navigation, actions and statuses — never decoration |

**Component vocabulary.** CSS classes in `index.css`: `btn` (`-primary`, `-secondary`, `-ghost`, `-danger`,
`-sm`, `-lg`, `-icon`), `input` (`-lg`, `-invalid`), `field-label`, `segmented` + `tab`, `kbd`, `sheet`,
`section-head`, `kicker`, `meta`, `code`, `badge` (square tags for categories such as role or backup kind),
`status`, `alert`, `data-table`. React components in `components/ui.tsx` and `PageShell.tsx`: `Status`,
`Alert`, `StatCard` + `FigureRow` (ruled figures, not cards), `Field`, `SearchInput`, `Modal` (focus trap,
topmost-only Escape), `ConfirmDialog` (destructive dialogs focus Cancel), `EmptyState`, `Spinner`, `PageShell`,
`SectionHead`, `ScrollBox`, `Pagination`; plus `ProductName` (title + dosage form) and `CommandPalette` (Ctrl K).

**Status is never colour-only.** `Status` always renders a word and an icon: a warning triangle with
"Expired 12 d ago" or "Out of stock", a clock with "28 days left", a check with "Active" or "Balanced".
Red is reserved for expired stock, out of stock, errors and destructive actions; ochre for expiring soon, low
stock and drawer or backup attention; lime only as a marker under ink (active page, last-added cart line,
change to return), never as text on paper.

## 4. Rollout status

Every page uses the system: POS, Cash drawer, Sales history, Returns, Products, Receive stock, Inventory,
Today, Reports, Assistant (Ask, Analyze, Smart search), Users, MoPH catalogue, Backup, Pharmacy profile,
Settings, My account and Sign in. Business logic, API contracts and data are unchanged; the one server change
is an additive inventory filter and sort (`expiry`, `sort` query parameters, covered by
`inventoryFilters.test.ts`).

Known gaps:

- No report of sales by tendered currency (USD vs LBP cash) over a date range; only by payment method.
- Low-stock and valuation figures still count expired units until they are written off (the POS never sells them).
- Receipts and the shift report are separate print templates (`receiptTemplate`, `shiftReport`) and were not
  restyled; they are designed for 80 mm thermal paper.
- Verified at 1440, 1280 and 1024 px wide and on a touch-size input rule; there is no phone layout for the POS.
