import localFont from "next/font/local";

/**
 * Self-hosted Latin-subset fonts (OFL licences in src/fonts).
 * Display: a static Fraunces cut (weight 600, fully soft), built by
 * scripts/build-display-font.sh. 17 KB instead of 62 KB for the variable font.
 * UI: Atkinson Hyperlegible Next (variable), designed for low-vision readability.
 */
export const display = localFont({
  src: "../fonts/fraunces-soft-600.woff2",
  variable: "--font-fraunces",
  weight: "600",
  display: "optional",
  fallback: ["Iowan Old Style", "Georgia", "serif"],
  adjustFontFallback: "Times New Roman",
});

export const sans = localFont({
  src: "../fonts/atkinson-hyperlegible-next.woff2",
  variable: "--font-atkinson",
  weight: "200 800",
  display: "optional",
  fallback: ["system-ui", "Segoe UI", "Roboto", "sans-serif"],
  adjustFontFallback: "Arial",
});
