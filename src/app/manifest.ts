import type { MetadataRoute } from "next";

import en from "../../messages/en.json";

/**
 * The web app manifest (CLAUDE.md §13; D-092, D-124). The name is the
 * neutral short name everywhere (D-059), and so are the shortcuts and the
 * screenshots' labels: the install sheet and the Home Screen say nothing
 * about the topic. Screenshots show only Take a breath, the daily reading
 * and a group's "together" total (owner, 2026-10-27); they're made by
 * `npm run screenshots` from the demo data.
 */
export default function manifest(): MetadataRoute.Manifest {
  const shortcutIcon = [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }];
  return {
    id: "/home",
    name: en.app.tabName,
    short_name: en.app.tabName,
    description: en.app.description,
    start_url: "/home",
    scope: "/",
    display: "standalone",
    display_override: ["standalone"],
    background_color: "#13112b",
    theme_color: "#13112b",
    categories: ["lifestyle", "health", "education"],
    launch_handler: { client_mode: "focus-existing" },
    shortcuts: [
      { name: en.meta.checkIn, short_name: en.meta.checkIn, url: "/check-in", icons: shortcutIcon },
      { name: en.meta.breathe, short_name: en.meta.breathe, url: "/breathe", icons: shortcutIcon },
    ],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/monochrome-192.png", sizes: "192x192", type: "image/png", purpose: "monochrome" },
      { src: "/icons/monochrome-512.png", sizes: "512x512", type: "image/png", purpose: "monochrome" },
    ],
    screenshots: [
      ...(["breathe", "reading", "together"] as const).map((name) => ({
        src: `/screenshots/narrow-${name}.png`,
        sizes: "824x1830",
        type: "image/png",
        form_factor: "narrow" as const,
        label: en.pwa.screenshots[name],
      })),
      ...(["breathe", "reading", "together"] as const).map((name) => ({
        src: `/screenshots/wide-${name}.png`,
        sizes: "1920x1200",
        type: "image/png",
        form_factor: "wide" as const,
        label: en.pwa.screenshots[name],
      })),
    ],
  };
}
