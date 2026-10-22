import type { MetadataRoute } from "next";

import en from "../../messages/en.json";

/**
 * The web app manifest (CLAUDE.md §13, D-092). Minimal for Phase 7: enough
 * to add the app to a Home Screen, which iPhones need before they allow push.
 * The name is the neutral short name everywhere (D-059). Phase 8a adds the
 * SOS shortcut (to the offline-ready /breathe page, D-106); Phase 10 adds the
 * rest and screenshots.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/home",
    name: en.app.tabName,
    short_name: en.app.tabName,
    description: en.app.description,
    start_url: "/home",
    scope: "/",
    display: "standalone",
    background_color: "#13112b",
    theme_color: "#13112b",
    shortcuts: [
      {
        name: en.meta.breathe,
        short_name: en.meta.breathe,
        url: "/breathe",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/monochrome-512.png", sizes: "512x512", type: "image/png", purpose: "monochrome" },
    ],
  };
}
