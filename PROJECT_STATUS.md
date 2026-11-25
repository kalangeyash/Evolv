# EVOLV — project status

_Last updated: 2026-11-25 (v1.0.0)_

"Complete" below means implemented **and** exercised by automated tests or a manual check in the production build, as stated. Interface-only work is not counted as complete.

## Phase summary

| Phase | Status | Verified by |
|---|---|---|
| 1. Foundation (Next.js static export, design system, navigation, profile, IndexedDB, migrations) | Done | Unit tests (seed, repos), e2e (all 14 routes render and refresh) |
| 2. Import engine (parser, preview, validation, duplicates, transactional save) | Done | 36 parser tests, 12 persistence tests, e2e import + duplicate merge |
| 3. Food journal (timeline, editing with provenance, manual entry, search, frequent foods, meal analytics) | Done | Persistence tests (corrections, deletes), e2e manual entry |
| 4. Dashboard (daily summary, nutrition cards, intake line, rings, weight, meals, observations, customisation) | Done | Analytics tests, e2e, screenshot review (desktop + mobile) |
| 5. Body analytics (weight, moving average, weekly/monthly, measurements, BMI) | Done | Analytics tests, e2e weight logging |
| 6. Activity and workouts (Apple Watch data, charts, sessions, library, PRs, 1RM) | Done | Analytics tests; workout save covered by backup tests |
| 7. Advanced analytics (nutrition intelligence, reports, calendar, goals, insights, energy balance) | Done | Analytics + insight tests, screenshot review |
| 8. Data and deployment (backup, restore, CSV, PWA, offline, GitHub Pages workflow) | Done | Backup tests incl. corrupted and failed restores; e2e offline; production build under `/Evolv` |
| 9. Final audit | Done for this release; see open items | Full test run below |

## Test status (last run 2026-11-25)

- Unit/integration: **76 passed**
- End-to-end on the production export (desktop Chrome + Pixel 7): **10 passed, 2 skipped by design**
- Typecheck and lint: **clean**

## Acceptance criteria

| # | Criterion | Status |
|---|---|---|
| 1 | Enter and edit profile | Done |
| 2 | Paste Gemini report | Done |
| 3 | Parser extracts food and activity | Done (3 layouts + edge cases tested) |
| 4 | Preview and correct before import | Done |
| 5 | Duplicate detection | Done (identical text, same content, same date) |
| 6 | Data persists after refresh | Done (e2e) |
| 7 | Dashboard uses real values | Done |
| 8 | Journal shows imported records | Done (e2e) |
| 9 | Weight history | Done |
| 10 | Body measurements | Done |
| 11 | Workout logging | Done |
| 12 | Activity tracking | Done |
| 13 | Weekly and monthly analytics | Done |
| 14 | Historical access | Done (calendar, date switcher, search) |
| 15 | Backup and restore | Done (atomic, validated) |
| 16 | Offline after install | Done (Chromium e2e) |
| 17 | Free hosting | Done (GitHub Pages workflow) |
| 18 | No fake statistics or dead controls | Done to the best of the audit; every figure derives from stored records |
| 19 | Polished mobile and desktop | Done for dark theme; light theme not screenshot-reviewed |
| 20 | Critical logic has tests | Done |

## Technical decisions

- Next.js `output: "export"`, `trailingSlash: true`, `BASE_PATH` env for the GitHub Pages subpath. `cacheComponents` and PPR off.
- Derived analytics over stored aggregates. The only stored aggregate is the optional "use reported totals" override.
- Goal versions with effective dates preserve historical targets.
- `null` means missing everywhere; averages count logged days only.
- pnpm instead of npm: npm 11.4 crashed (`edgesOut`) resolving this dependency tree.
- The React Compiler lint rule `set-state-in-effect` is disabled. Dialogs intentionally re-seed form state from live records when opened.

## Pending / open items

- **The real 25 November 2026 sample report was not in the specification.** The fixture `report-2026-11-25.md` is a representative stand-in matching the described shape (6 entries, 1,757 kcal, Apple Watch data). Add the real report as a fixture and test.
- Safari/iOS PWA behaviour is untested (Playwright runs Chromium only).
- The light theme has not been visually reviewed.
- Charts have tooltips and legends, and several pages have tables, but not every chart has a "view as table" toggle.
- Overview widgets reorder with up/down buttons, not drag and drop.
- Strength sets are entered manually; daily reports only provide workout summaries.
- Backup reminders are in-app toasts only (no system notifications).

## Known bugs

None open at release. Fixed during the audit:

- Mobile focus-zoom pushed dialogs off-screen (input font now 16px on small screens).
- A card header's range selector widened the Body page on mobile.
- An inline `— Score: 7/10` stayed inside food names instead of filling the score.

## Deployment status

GitHub Actions workflow ready. Requires **Settings → Pages → Source: GitHub Actions** once on the repository. Target URL: https://kalangeyash.github.io/Evolv/
