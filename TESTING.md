# Testing

| Suite | Command | What it covers |
|---|---|---|
| Unit + integration | `pnpm test` | Parser, normalisation, validation, fingerprints; nutrition, body, activity, workout, energy and insight analytics; persistence (import modes, duplicates, atomic rollback, corrections, deletes); backup export/restore/validation; CSV escaping. Uses `fake-indexeddb` with the real Dexie schema. |
| End-to-end | `BASE_PATH=/Evolv pnpm build && pnpm test:e2e` | Runs the **production static export** under the `/Evolv` subpath on desktop Chrome and a Pixel 7 profile: every page renders without console errors, nested routes survive a refresh, paste → preview → import → reload persistence, duplicate detection and merge, manual food entry, weight logging, invalid-report blocking, offline navigation through the service worker, and no horizontal overflow on mobile. |
| Types | `pnpm typecheck` | `tsc --noEmit` |
| Lint | `pnpm lint` | ESLint (Next.js core-web-vitals + TypeScript) |

## Results at the last run (2026-11-25)

- `pnpm test`: **76 passed** (4 files).
- `pnpm test:e2e`: **10 passed, 2 skipped** (the offline test runs on desktop only; the overflow test on mobile only).
- `pnpm typecheck` and `pnpm lint`: clean.

## Fixtures

- `src/test/fixtures/report-2026-11-25.md`: Gemini-style markdown report with 6 entries, totals table (1,757 kcal), Apple Watch block, workout, energy balance, notes and uncertainty. **This is a representative stand-in.** The real 25 November report was not included in the specification; add it as another fixture and test when available.
- `report-plain.txt`: numbered plain-text layout, inline macros, `N/A` fiber, a total that differs from the entries.
- `report-table.md`: one-row-per-meal markdown table.

## Not covered by automated tests

- Safari/WebKit and iOS standalone PWA behaviour (only Chromium is exercised).
- Visual appearance of the light theme (checked manually only).
- Print/PDF layout of Reports.
