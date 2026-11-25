// Post-build: write out/sw.js with a precache list of every exported file.
// Runs after `next build` (static export). No third-party dependencies.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";

const OUT = "out";
const BASE = (process.env.BASE_PATH ?? "").replace(/\/$/, "");
if (!existsSync(OUT)) {
  console.error("generate-sw: ./out not found. Run `next build` first.");
  process.exit(1);
}

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(p);
  }
})(OUT);

const hash = createHash("sha256");
const urls = [];
for (const f of files.sort()) {
  const rel = relative(OUT, f).split(sep).join("/");
  if (rel === "sw.js" || rel.endsWith(".map")) continue;
  hash.update(rel).update(readFileSync(f));
  // Pages are emitted as dir/index.html; cache them under their directory URL too.
  if (rel.endsWith("index.html")) {
    const dir = rel.slice(0, -"index.html".length);
    urls.push(`${BASE}/${dir}`);
  }
  urls.push(`${BASE}/${rel}`);
}
const version = hash.digest("hex").slice(0, 12);

const sw = `/* EVOLV service worker — generated at build time. Do not edit. */
const VERSION = "evolv-${version}";
const BASE = ${JSON.stringify(BASE)};
const PRECACHE = ${JSON.stringify(urls)};

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) =>
      Promise.allSettled(PRECACHE.map((u) => cache.add(new Request(u, { cache: "reload" }))))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("evolv-") && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function fromCache(request, url) {
  const cache = await caches.open(VERSION);
  return (
    (await cache.match(request, { ignoreSearch: true })) ||
    (url.pathname.endsWith("/") ? await cache.match(url.pathname + "index.html") : await cache.match(url.pathname + "/")) ||
    null
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE + "/")) return;

  if (request.mode === "navigate") {
    // Network first so updates arrive promptly; cached shell when offline.
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) caches.open(VERSION).then((c) => c.put(url.pathname, res.clone()));
          return res;
        })
        .catch(async () => (await fromCache(request, url)) || (await caches.match(BASE + "/")) || Response.error())
    );
    return;
  }

  // Static assets and RSC payloads: cache first, then network.
  event.respondWith(
    fromCache(request, url).then(
      (hit) =>
        hit ||
        fetch(request).then((res) => {
          if (res.ok && res.type === "basic") caches.open(VERSION).then((c) => c.put(request, res.clone()));
          return res;
        })
    )
  );
});
`;
writeFileSync(join(OUT, "sw.js"), sw);
writeFileSync(join(OUT, ".nojekyll"), "");
console.log(`generate-sw: precached ${urls.length} URLs, version ${version}, base "${BASE || "/"}"`);
