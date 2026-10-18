# PharmaCore — design direction

This document records why the interface looks the way it does and is the reference for anyone adding a screen.
The current direction is **Graphite Console**. It replaced the first redesign ("Editorial Precision", commit
`53039f6`), which is summarised at the end for history.

## 1. Why a second redesign

The ledger direction fixed the generic-admin look but read as dated: ivory everywhere, a serif for titles and
totals, ruled "account book" headings, and one flat plane where the sidebar, header and content were separated only
by hairlines. Nothing told the eye where the work area was, there was no dark theme, and common tasks had extra
steps (editing a product meant scrolling to a side form; receiving stock meant searching and then picking from a
`<select>`).

Three concepts were proposed:

- **A. Graphite Console — "the dispensing instrument".** Graphite frame, warm working canvas, one emerald accent,
  readout typography, keyboard first. Risk: drifting into a developer tool, so surfaces stay warm and data
  presentation stays pharmacy-specific (expiry, dosage form, dual currency).
- **B. Layered Workspace — "the premium desktop app".** Floating sheets on a stone canvas, a dock, soft elevation.
  Risk: generic glassy SaaS.
- **C. Counter Station — "touch-first retail".** Tabs, big numerals, tiles. Risk: useless for an 11,000-item
  regulated catalogue sold by scan and search.

**Decision: A**, borrowing one idea from B (a product inspector panel) where it removes a real step.

## 2. Principles

- **The frame is graphite in both themes; the work is on the canvas.** Rail and command bar are always graphite.
  The workspace is an inset canvas with a rounded top-left corner, so the working area is obvious.
- **Both themes are designed, not inverted.** Light uses warm ivory surfaces on a stone canvas; dark uses charcoal
  with a brighter emerald. Neither is "the POS theme": the whole app follows the user's preference.
- **One accent.** Emerald is the only brand colour: primary actions, selection, links, the current page. A brighter
  "signal" emerald is used only for live-status dots.
- **Red means something is wrong.** Danger is reserved for expired stock, errors and destructive actions; amber
  (caution) for expiring soon, low stock, drawer or backup attention.
- **Status is never colour-only.** `Status` always renders an icon and a word ("Expired 12 d ago", "21 days left").
- **No invented numbers.** Every figure, meter and chart comes from an existing API response. If the data does not
  exist (for example there is no reorder level per product in the catalogue list), nothing is drawn.

## 3. Theme system

| Piece | Where |
| --- | --- |
| Role tokens `--c-*` for light (`:root, [data-theme="light"]`) and dark (`[data-theme="dark"]`) | `client/src/index.css` |
| `@theme inline` maps every Tailwind colour to `var(--c-…)`, so utilities resolve per element and scopes work | `index.css` |
| `.scope-graphite` re-maps the roles to graphite values for a region (rail, command bar, POS checkout, focus POS, toasts). It sets no background; the region adds `bg-frame` or `bg-canvas` | `index.css` |
| Preference `light` / `dark` / `system`; stored in `localStorage.pharmacore_theme` (absent = system) | `context/ThemeContext.tsx` |
| No flash: an inline script in `index.html` sets `data-theme` before the bundle loads (verified by a screenshot 40 ms after navigation) | `client/index.html` |
| Switch: sun / monitor / moon radiogroup in the command bar | `components/Layout.tsx` |

Tailwind's default palette is switched off (`--color-*: initial`); `black` and `white` do not exist, so a stray
`text-slate-500` or `bg-black/10` renders nothing (or fails the build) and is caught.

### Tokens

| Role | Light | Dark |
| --- | --- | --- |
| canvas / surface / surface-2 / surface-3 | `#eeece5` / `#fbfaf7` / `#f3f1eb` / `#e8e5dc` | `#121514` / `#191d1b` / `#202523` / `#2a302d` |
| fg / fg-2 / fg-3 / fg-4 | `#1a1d1c` / `#444945` / `#62675f` / `#9a9d95` | `#ecebe4` / `#c3c6bd` / `#979c93` / `#6a6f68` |
| line / line-strong / line-input | `#e0ddd3` / `#c8c3b5` / `#858175` | `#2a302d` / `#3b423e` / `#6e7671` |
| accent / accent-text / accent-soft | `#0e6b4e` / `#0b6649` / `#e1f0e8` | `#2fb380` / `#5fd3a2` / `#14322a` |
| danger / caution | `#b0261b` / `#8c5800` | `#ff8a7a` / `#eab558` |
| frame / frame-fg / frame-fg-2 | `#1b1e1d` / `#ebe8df` / `#a4a89f` | `#0c0e0d` / … |

Measured contrast (WCAG formula, `.shots/contrast2.mjs`):

| Pair | Light | Dark |
| --- | --- | --- |
| fg on surface | 16.3 | 14.3 |
| fg-2 on surface | 8.8 | 9.8 |
| fg-3 (meta, placeholders) on surface / canvas | 5.6 / 4.9 | 6.1 / 6.6 |
| accent-fg on accent (primary button) | 6.2 | 7.0 |
| accent-text on surface / accent-soft | 6.7 / 5.9 | 9.2 / 7.5 |
| danger on surface | 6.4 | 7.4 |
| caution on surface | 5.7 | 9.1 |
| line-input (field border) on surface / surface-2 | 3.3 / 3.5 | 3.6 / 3.3 |
| frame-fg / frame-fg-2 on frame | 13.7 / 6.9 | — |

`fg-4` (2.6 light, 3.3 dark) is only for disabled text and empty-value dashes, never for labels or placeholders.

### Type, shape, motion

| Group | Value |
| --- | --- |
| Type | Instrument Sans 400–700 for the interface (tabular figures verified), IBM Plex Mono for codes, barcodes, dates and the exchange rate. Both bundled as woff2 with their OFL licences in `client/src/assets/fonts/` |
| Sizes | `2xs` 11 · `xs` 12 · `dense` 13 (tables) · `sm` 14 (body) · `lead` 15 · `title` 22 (page titles) · `figure` 30 (key figures) · `readout` 52 (the sale total) |
| Radii | 3 (keycaps) · 5 (controls) · 8 (cards) · 10 (dialogs) · 12 (the canvas corner, login card) |
| Elevation | `shadow-raised` (subtle) for cards and secondary buttons; `shadow-overlay` for dialogs, panels, the command palette and dropdowns |
| Focus | 2px accent outline on `:focus-visible`; fields add a 3px `accent-soft` ring |
| Motion | 140ms colour/border transitions; `enter` and `slide-in` for overlays; `flash` on the last-added cart line; everything stops under `prefers-reduced-motion` |

## 4. Components

CSS classes in `index.css`: `btn` (`-primary`, `-secondary`, `-ghost`, `-danger`, `-sm`, `-lg`, `-icon`), `input`
(`-lg`, `-invalid`), `field-label`, `field-hint`, `segmented` + `tab`, `kbd`, `sheet` / `card`, `section-head`,
`kicker`, `meta`, `code`, `badge`, `status`, `signal`, `alert`, `data-table` (with `is-selected` / `aria-selected`
rows: accent-soft fill and a 3px emerald edge), `meter` (`-ok`, `-caution`, `-danger`).

React components:

- `ui.tsx`: `Status`, `Alert`, `Badge`, `StatCard` + `FigureRow` (an instrument strip, `columns={3|4}`), `Field`,
  `SearchInput`, `Modal` (focus trap, topmost-only Escape, focus return; `side` docks it to the right edge as a
  full-height panel), `ConfirmDialog`, `EmptyState`, `Spinner`.
- `PageShell.tsx`: `PageShell`, `SectionHead`, `ScrollBox`. `Pagination`.
- `ProductName` (title + dosage form), `ExpiryCell` (date, status and a 12-month shelf-life meter),
  `RevenueChart` (SVG columns from `/api/reports/daily-revenue`, hover readout, hidden table for screen readers),
  `ProductInspector`, `CommandPalette` (Ctrl K: pages and products), `Toaster` + `lib/toast.ts`.

## 5. Screens

- **Shell.** Collapsible graphite rail (expanded from 1280 px, remembered in `pharmacore_rail`; a drawer below
  1024 px), command bar with breadcrumb, Ctrl K search, backup and drawer status, exchange rate and theme switch.
- **POS.** Scan field, cart with keyboard map when empty, graphite checkout column with the total as a readout,
  composite tender fields with "Exact" (F7/F8), change to return. Optional **Focus** mode turns the whole POS
  workspace graphite (remembered in `pharmacore_pos_focus`).
- **Products.** Full-width catalogue; a row opens the **product inspector** (`/products?product=ID`, also reached
  from Ctrl K and from Inventory): price in USD/LBP, on-hand units, identity (MoPH code, barcode, brand, category),
  batches with expiry meters, cost (managers only) and Adjust. Edit and Add product happen in the same panel.
- **Inventory.** Batches with expiry meters; product names open the inspector.
- **Receive stock.** One search field: type, arrow keys, Enter; the chosen product is confirmed with its current
  stock and focus moves to Quantity. "Received recently" shows the latest batches.
- **Today.** Takings today, three shelf checks (reorder, expired, expiring), and a 7-day revenue chart for roles
  that may see sales.
- **Reports.** Figure strip, daily revenue chart, payment methods, cashiers, fastest sellers with days of cover,
  profit (owner), reorder and expiry lists, stock movements. Every table keeps its CSV export.
- Every other page (Sales history, Returns, Cash drawer, Users, MoPH, Backup, Settings, Pharmacy profile, Account,
  Assistant, Sign in) uses the same cards, tables and controls.

### POS default: light, with Focus as an option

Both variants were built and compared on real data at 1024–1440 px. The light POS (ivory cart, graphite checkout)
is the default: the checkout column already gives the total and change maximum contrast, product names and stock
notes read better on ivory under bright shop lighting, and forcing one page dark while the rest is light would
contradict the theme rule. In the dark theme the whole app, POS included, is dark. Focus mode exists for staff who
prefer a dark till during the day.

## 6. Functional changes made during the redesign

Business rules, APIs and the database are unchanged. Client-only changes:

- **Double checkout guard.** Ctrl+Enter calls `requestSubmit()`, which ignores the disabled button; two quick
  presses could record the same cart twice. `handleCheckout` now holds a synchronous in-flight flag.
- `api.getProduct(id)` wraps the existing `GET /api/products/:id` for the inspector.
- Success messages that used to sit in page alerts are toasts (receive, adjust, product save, sale completed).
- A "Skip to content" link is the first Tab stop, so keyboard users don't walk the whole rail on every page.
- A grid without a column template gets one shrinkable column (`index.css`, base layer); otherwise a wide table
  stretched the implicit column and pushed narrow pages sideways.

## 7. Known gaps

- Receipts and the shift report are separate 80 mm print templates and were not restyled.
- Phones are a fallback, not a target: at 390 px nothing overflows and a keyboard sale still works, but the cart
  and checkout stack and the cashier scrolls to pay. Layouts were checked at 1440, 1280, 1024, 768 and 390 px.
- No sales-by-tendered-currency report; low-stock figures still count expired units until they are written off.
- Product list stock is a number, not a meter: the catalogue has no per-product target to measure against.

## History: Editorial Precision (first redesign)

Ivory paper, near-black ink, forest green and a lime marker; IBM Plex Serif for titles and totals; ruled ledger
sections. It replaced a generic teal-on-slate admin template (default Tailwind palette, cards in cards, KPI tiles,
pill statuses). Its lasting contributions — the disabled default palette, tabular figures, status as icon plus
word, red reserved for danger, keyboard-first POS — carry over into Graphite Console.
