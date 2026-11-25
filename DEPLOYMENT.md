# Deployment (GitHub Pages, free)

EVOLV is a static site. The workflow `.github/workflows/deploy.yml` builds and deploys it on every push to `main`.

## Status

**Live** at https://kalangeyash.github.io/Evolv/ (deployed from `main`). The repository is public because GitHub's free plan only serves Pages from public repositories; only code is published, never user data. Development happens on the `development` branch; merging into `main` deploys.

## One-time setup (already done for this repo)

1. Push the repository to GitHub.
2. On GitHub, open **Settings → Pages** and set **Source** to **GitHub Actions** (on the free plan the repository must be public).
3. Push to `main` (or run the workflow manually from the Actions tab).

The site is published at `https://<user>.github.io/<repo>/`. For this repo: **https://kalangeyash.github.io/Evolv/**

## How the subpath works

The workflow sets `BASE_PATH=/<repo name>` during `pnpm build`. Next.js uses it for `basePath` and `assetPrefix`; the manifest, service worker (`/<repo>/sw.js`, scope `/<repo>/`) and internal links follow it. `trailingSlash: true` emits `route/index.html`, so refreshing any page works on GitHub Pages without rewrites. A `.nojekyll` file is written so `_next/` is served.

If you rename the repository, the next deploy picks up the new path automatically. Existing installs keep their data only if they open the same origin and path. **Export a backup before renaming.**

## Building locally

```bash
BASE_PATH=/Evolv pnpm build     # writes ./out and ./out/sw.js
BASE_PATH=/Evolv pnpm preview   # serves ./out at http://localhost:4173/Evolv/
```

`pnpm build` with no `BASE_PATH` produces a root-hosted build (for a custom domain or user site).

## Pipeline steps

`pnpm install --frozen-lockfile` → `typecheck` → `lint` → `test` → `build` (with `BASE_PATH`) → upload `out/` → deploy. A failing test blocks deployment.

## Data and deployments

Deploying never touches user data: records live in each browser's IndexedDB. A new deploy installs a new service worker; the app shows a "new version ready" prompt and the update applies on reload.
