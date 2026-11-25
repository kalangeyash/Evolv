# EVOLV

**Your Body. Your Data. Your Evolution.**

EVOLV is a private, offline-first personal fitness and nutrition intelligence platform. Paste the daily food journal Gemini writes from your meal photos, and EVOLV turns it into a structured, searchable history of nutrition, Apple Watch activity, workouts, weight and body measurements, with analytics built only from your real records.

- Runs entirely in the browser. Data lives in IndexedDB on your device; nothing is uploaded.
- No accounts, no paid services, no AI APIs, no trackers.
- Installable as a PWA and works offline after the first load.
- Free to host on GitHub Pages as a static site.

## Quick start

```bash
pnpm install
pnpm dev            # http://localhost:3000
pnpm test           # unit + integration tests (Vitest)
BASE_PATH=/Evolv pnpm build && pnpm test:e2e   # production build + Playwright
```

## Documentation

| File | Contents |
|---|---|
| [PROJECT_STATUS.md](PROJECT_STATUS.md) | What is done, tested, pending, and known issues |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Structure, data flow, key decisions |
| [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) | IndexedDB tables, indexes, migrations, backup format |
| [IMPORT_FORMAT.md](IMPORT_FORMAT.md) | What the report parser understands |
| [TESTING.md](TESTING.md) | Test suites and how to run them |
| [DEPLOYMENT.md](DEPLOYMENT.md) | GitHub Pages deployment |
| [CHANGELOG.md](CHANGELOG.md) | Release history |

Nutrition figures in EVOLV are estimates from photo-based reports. EVOLV is not a medical device and gives no medical advice.
