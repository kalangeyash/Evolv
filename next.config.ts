import type { NextConfig } from "next";

/**
 * EVOLV is a fully static, client-only app (no server, no API routes).
 *
 * BASE_PATH lets the same build run at a GitHub Pages project subpath
 * (e.g. "/evolv") or at the domain root (empty string). It is read at build
 * time and also exposed to client code as NEXT_PUBLIC_BASE_PATH so the
 * service worker and manifest can be registered under the right prefix.
 */
const basePath = (process.env.BASE_PATH ?? "").replace(/\/$/, "");

const nextConfig: NextConfig = {
  output: "export",
  basePath: basePath || undefined,
  assetPrefix: basePath || undefined,
  // `/journal` is emitted as `/journal/index.html`, so refreshing a nested
  // route on GitHub Pages resolves to a real file instead of a 404.
  trailingSlash: true,
  images: { unoptimized: true },
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_PUBLIC_APP_VERSION: process.env.npm_package_version ?? "1.0.0",
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
