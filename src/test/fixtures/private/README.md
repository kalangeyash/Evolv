# Private fixtures (git-ignored)

Put your real Gemini reports here to validate the parser against them.
Files in this folder are excluded from git so personal health data never
reaches the repository.

- `report-2026-11-25.md` (or `.txt`): the actual 25 November 2026 report.
  `src/lib/parser/real-report.test.ts` checks it against the source figures
  recorded in that test. The test is skipped when the file is absent.
