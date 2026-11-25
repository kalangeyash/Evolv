import type { MetadataRoute } from "next";

export const dynamic = "force-static";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: `${BASE}/`,
    name: "EVOLV — Personal Fitness & Nutrition Intelligence",
    short_name: "EVOLV",
    description: "Your Body. Your Data. Your Evolution.",
    start_url: `${BASE}/`,
    scope: `${BASE}/`,
    display: "standalone",
    orientation: "portrait",
    background_color: "#101211",
    theme_color: "#101211",
    categories: ["health", "fitness", "lifestyle"],
    icons: [
      { src: `${BASE}/icons/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${BASE}/icons/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `${BASE}/icons/icon-maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Import daily report", url: `${BASE}/import/` },
      { name: "Food journal", url: `${BASE}/journal/` },
    ],
  };
}
