# EVOLV architecture

## Stack

| Concern | Choice |
|---|---|
| Framework | Next.js 16 (App Router) with `output: "export"`, React 19, TypeScript |
| Styling | Tailwind CSS 4, hand-written shadcn-style components (Radix Dialog/Tabs/Slot), Lucide icons |
| Charts | Recharts 3 |
| Storage | IndexedDB via Dexie 4, live queries via `dexie-react-hooks` |
| UI state | Zustand (selected date, sidebar only) |
| Dates | date-fns |
| Validation | Zod (backup files); hand-written validators for forms and imports |
| Tests | Vitest + fake-indexeddb + Testing Library; Playwright against the production export |
| Offline | Generated service worker (`scripts/generate-sw.mjs`) + web manifest |

## Folder layout

```
src/
  app/                 Route files only: each page.tsx sets <title> and renders a view
  components/
    views/             One client view per route (overview, import, journal, …)
    ui/                Design-system primitives (button, card, dialog, rings, chart…)
    layout/            App shell, sidebar, mobile nav, date switcher, brand
    food/ activity/ body/ workouts/ import/ charts/   Feature components
    providers.tsx      DB gate, theme, service worker, backup reminder, toasts
  hooks/               Live IndexedDB queries, mutation feedback, ?date= deep links
  stores/              Zustand UI store
  lib/
    db/                Types, Dexie schema + migrations, seed data, repositories (all writes)
    parser/            Report import: text → parse → normalize → validate (pure, no I/O)
    import/            Transactional persistence of a reviewed report
    analytics/         Pure functions: nutrition, body, activity, workouts, energy, insights
    backup/            JSON backup/restore, CSV export, clear-all
    utils/             Dates, formatting, ids, hashing
  test/fixtures/       Sample reports used by unit tests and e2e
scripts/               Service-worker generator, icon generator, static server for previews
e2e/                   Playwright tests
```

## Data flow

1. **Source records** (food entries, activity days, weigh-ins, measurements, workouts) are the only stored facts. Each carries `source` (`import` / `manual` / `profile` / `backup`), timestamps, and for imports an `importId`.
2. **Derived numbers** (day totals, weekly averages, PRs, trends, insights) are computed on read by pure functions in `lib/analytics`. Editing a food entry therefore updates every screen immediately. The single stored aggregate is an optional per-day "use the report's printed totals" override (`dailyNutritionSummaries`), which exists only when you choose it during import.
3. **Targets** are versioned (`goalVersions.effectiveFrom`); analytics look up the version in force on each day, so changing targets never rewrites history.
4. **Writes** go through `lib/db/repos.ts` or `lib/import/persist.ts`. Multi-record writes use a single Dexie transaction, so failures leave nothing half-written.

## Import pipeline

`parseReport(text)` = `normalizeReport(parseReportStructure(text))`, then `validateReport()`.

- **parse.ts** identifies sections (entries, totals, activity, workouts, energy, notes, uncertainty), entry headers, key/value lines, inline macro runs and markdown tables. Values stay strings.
- **normalize.ts** converts strings to typed values, records approximations (`~`, ranges, `<1`), infers meal categories, detects brands, and emits issues. Missing data stays `null`.
- **validate.ts** sums the included entries, compares them with reported totals (match / rounding / mismatch), and decides whether import is allowed.
- **persist.ts** handles duplicates (content hash and fingerprint) and new/merge/replace modes inside one transaction.

No LLM or network call is involved anywhere.

## Key decisions

- **Static export, client-only.** No server, no API routes; it can be hosted on GitHub Pages for free. Day views use a global selected date (and `?date=` deep links) instead of dynamic routes, which static export cannot pre-render.
- **`cacheComponents` / PPR disabled.** They add nothing without a server and complicate a pure export.
- **`trailingSlash: true`.** Every route becomes `route/index.html`, so refreshing a nested URL on GitHub Pages works.
- **`BASE_PATH` at build time.** The same code serves from `/` or `/<repo>/`; the manifest, service worker scope and asset prefix all follow it.
- **Missing is never zero.** Every analytic treats `null` as "no data". Averages are over logged days only, with counts shown.
- **Estimates are labelled.** 1RM (Epley), maintenance (Mifflin-St Jeor or trend), macro energy shares and energy balance carry confidence labels. Apple Watch Move calories are never used as total expenditure.
- **Chart palette validated.** Series colours were checked for lightness band, colour-vision-deficiency separation and contrast in both themes; status is always paired with an icon and text.
