// Minimal static server for testing the production export, including a
// base path (BASE_PATH=/Evolv node scripts/serve-out.mjs). Mirrors GitHub
// Pages: dir/ -> dir/index.html, unknown paths -> 404.html.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const BASE = (process.env.BASE_PATH ?? "").replace(/\/$/, "");
const PORT = Number(process.env.PORT ?? 4173);
const ROOT = "out";
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8", ".woff2": "font/woff2" };

createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (BASE) {
    if (!path.startsWith(BASE)) { res.writeHead(404).end("Not found"); return; }
    path = path.slice(BASE.length) || "/";
  }
  let file = normalize(join(ROOT, path));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  try {
    const s = await stat(file);
    if (s.isDirectory()) {
      if (!path.endsWith("/")) { res.writeHead(301, { Location: `${BASE}${path}/` }).end(); return; }
      file = join(file, "index.html");
    }
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" }).end(body);
  } catch {
    const body = await readFile(join(ROOT, "404.html")).catch(() => "Not found");
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" }).end(body);
  }
}).listen(PORT, () => console.log(`Serving ./out at http://localhost:${PORT}${BASE}/`));
