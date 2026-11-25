# Testing

| Suite | Command | What it covers |
|---|---|---|
| Unit + integration | `pnpm test` | Parser, normalisation, validation, fingerprints; nutrition, body, activity, workout, energy and insight analytics; persistence (import modes, duplicates, atomic rollback, corrections, deletes); backup export/restore/validation; CSV escaping. Uses `fake-indexeddb` with the real Dexie schema. |
| End-to-end | `BASE_PATH=/Evolv pnpm build && pnpm test:e2e` | Runs the **production static export** under the `/Evolv` subpath on four profiles (desktop Chrome, Pixel 7, desktop Safari/WebKit, iPhone 14/WebKit): every page renders without console errors, nested routes survive a refresh, paste → preview → import → reload persistence, duplicate detection and merge, manual food entry, weight logging, invalid-report blocking, offline navigation through the service worker (Chromium and WebKit desktop), chart table views, theme persistence, and no horizontal overflow on mobile with and without data. |
| Types | `pnpm typecheck` | `tsc --noEmit` |
| Lint | `pnpm lint` | ESLint (Next.js core-web-vitals + TypeScript) |

## Results at the last run (2026-11-25, v1.0.1)

- `pnpm test`: **96 passed, 9 skipped** (the 9 are the real-report suite, skipped until the private fixture exists).
- `pnpm test:e2e`: **28 passed, 4 skipped** across 4 browser profiles (offline runs on the two desktop profiles; the overflow check on the two mobile profiles).
- `pnpm typecheck` and `pnpm lint`: clean.

### Real report validation

Save the actual report as `src/test/fixtures/private/report-2026-11-25.md` (git-ignored) and run `pnpm test`. The suite checks date, 6 entries, totals (1,757 kcal; 80.5 g protein; 224.6 g carbs; 57.5 g fat; 16.5 g fiber), Apple Watch metrics (move 730/500, exercise 80/60, stand 12/12, 10,509 steps, 8.32 km), the Outdoor Walk (1.24 km), energy-balance text, import persistence and duplicate detection.

## Fixtures

- `src/test/fixtures/report-2026-11-25.md`: Gemini-style markdown report with 6 entries, totals table (1,757 kcal), Apple Watch block, workout, energy balance, notes and uncertainty. **This is a representative stand-in.** The real 25 November report was not included in the specification; add it as another fixture and test when available.
- `report-plain.txt`: numbered plain-text layout, inline macros, `N/A` fiber, a total that differs from the entries.
- `report-table.md`: one-row-per-meal markdown table.

## Not covered by automated tests

- **A real iPhone/iPad.** WebKit in Playwright approximates Safari, but Home Screen installation, iOS storage eviction, safe areas on a notched device, and iOS notification permission were not tested on hardware.
- Light theme correctness beyond the screenshot review.
- Print/PDF layout of Reports.
