# EVOLV — project status

_Last updated: 2026-11-25 (v1.0.1, `development` branch)_

"Complete" means implemented **and** verified by the test or check named next to it. Interface-only work is never counted as complete.

## v1.0.1 validation tasks

| Task | Status | What was done and verified |
|---|---|---|
| 1. Real Gemini report validation | **Blocked on source text** | The full text of the 25 Nov 2026 report has still not been supplied, only its summary figures. Inventing six entries to match those totals would fabricate data, so it was not done. Instead, `real-report.test.ts` checks the real report against every supplied figure (date, 6 entries, 1,757 kcal / 80.5 P / 224.6 C / 57.5 F / 16.5 fiber, move 730/500, exercise 80/60, stand 12/12, 10,509 steps, 8.32 km, Outdoor Walk 1.24 km, energy-balance text, persistence, duplicates). It runs as soon as the text is saved to `src/test/fixtures/private/report-2026-11-25.md` (git-ignored, so personal data stays out of the public repo). Real-world fixes from reports you tested were made and are covered by tests: inline scores, steps in many layouts, and `Est. Net Balance` lines. |
| 2. Safari and iOS | **Partially verified** | Verified in WebKit (Playwright desktop Safari and iPhone 14 profiles): all pages render and survive refresh, import, persistence, duplicates, manual entry, weight logging, offline navigation through the service worker (desktop WebKit), and no mobile overflow. Added: safe-area padding for installed iOS apps, install guidance, and a Safari 7-day storage-eviction warning. **Not verified on a real iPhone/iPad:** Home Screen install, standalone mode, iOS storage eviction, notch safe areas, notification permission. |
| 3. Light theme audit | Done | All 14 pages screenshotted in light mode on desktop and mobile and reviewed. Fixed: calendar heatmap levels were nearly invisible on white. Text, cards, charts, progress bars, dialogs, tables, navigation and toasts read correctly. |
| 4. Chart accessibility | Done | Every chart has a Chart/Table toggle with a captioned table, an accessible name, and an empty-state message. The weight sparkline has a text label; the meal chart sits next to an equivalent table. Values never depend on colour or hover alone. Verified by e2e (table view on Overview). |
| 5. Backup reminders | Done | Persistent banner on Overview and Data while a backup is due; only when records changed since the last backup; re-checks when the app returns to the foreground; "Remind me tomorrow" snooze; "Back up now" exports directly. Optional system notification, opt-in and permission-gated, at most once a day, and only while EVOLV is open (stated in the UI; unsupported browsers are told so). Logic unit-tested (5 tests). Notifications were not tested on a real device. |
| 6. Regression audit | Done | See test status below. Two regressions caught and fixed before release: chart wrapper widening the populated Overview on mobile, and weigh-in pluralisation. |
| 7. Documentation | Done | This file, CHANGELOG, TESTING, IMPORT_FORMAT, DEPLOYMENT updated. |

## Test status (last run 2026-11-25)

- Unit/integration (Vitest): **96 passed, 9 skipped** (the real-report suite, pending the private fixture)
- End-to-end on the production export: **28 passed, 4 skipped by design** across desktop Chrome, Pixel 7, desktop Safari (WebKit), iPhone 14 (WebKit)
- Typecheck and lint: **clean**
- Production build with `BASE_PATH=/Evolv`: **succeeds**; service worker precaches 144 URLs

## Phase summary (v1.0.0)

| Phase | Status | Verified by |
|---|---|---|
| 1. Foundation | Done | Unit tests, e2e (all 14 routes render and refresh) |
| 2. Import engine | Done | Parser tests (layouts, edge cases, steps, energy lines, inline fields), persistence tests, e2e |
| 3. Food journal | Done | Persistence tests, e2e manual entry |
| 4. Dashboard | Done | Analytics tests, e2e, screenshots (dark + light, desktop + mobile) |
| 5. Body analytics | Done | Analytics tests, e2e weight logging |
| 6. Activity and workouts | Done | Analytics tests, backup tests |
| 7. Advanced analytics | Done | Analytics and insight tests, screenshots |
| 8. Data and deployment | Done | Backup tests incl. corrupted/failed restores, e2e offline, live deployment |
| 9. Final audit | Done | Full regression above |

## Technical decisions

- Static export (`output: "export"`, `trailingSlash: true`, `BASE_PATH`), no server.
- Derived analytics; the only stored aggregate is the optional "use reported totals" override.
- Versioned goals preserve historical targets; `null` means missing everywhere.
- pnpm (npm 11.4 crashed resolving the tree).
- `react-hooks/set-state-in-effect` lint rule off: dialogs re-seed forms from live records on open.
- New settings fields in 1.0.1 (`backupSnoozedUntil`, `backupNotifications`, `lastBackupNotifiedAt`) are optional and unindexed, so **no schema migration** was needed; older records and backups remain valid.
- Real reports used for testing live in a git-ignored folder so personal data is never published.

## Remaining limitations

- **Real 25 Nov report text not yet provided** (Task 1 blocker; see above).
- No real-device iOS testing. WebKit emulation only.
- Safari (not installed) may delete local data after 7 days without use; EVOLV warns about this and recommends installing plus backups.
- System notifications cannot fire while EVOLV is closed (no server, by design).
- Overview widgets reorder with up/down buttons, not drag and drop.
- Strength sets are entered manually; reports provide workout summaries only.

## Known bugs

None open. Fixed in 1.0.0 and 1.0.1:

- Mobile focus-zoom pushed dialogs off-screen.
- A card header's range selector widened the Body page on mobile.
- A chart wrapper widened the populated Overview on mobile.
- Inline `— Score: 7/10` stayed inside food names.
- Steps in several common layouts were missed or absorbed into the last meal.
- `Est. Net Balance` lines were left unrecognised.
- Calendar heatmap levels were indistinguishable in light mode.

## Deployment status

**Live:** https://kalangeyash.github.io/Evolv/ serves `main` (v1.0.0 plus the steps fix). The repository was made public so the free plan can serve Pages. v1.0.1 is on the `development` branch and deploys when merged into `main`.
