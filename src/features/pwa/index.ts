/**
 * PWA module (CLAUDE.md §13; Phase 10, D-124 to D-127): the service worker's
 * helper in the signed-in shell, the update banner, the install prompt and
 * the offline page. The worker itself is public/sw.js (with sw-queue.js); the
 * shared rules and the device store are in src/lib/pwa.
 *
 * Public API, in two entry points (other modules may import only these):
 *   "@/features/pwa"     server components and label helpers
 *   "@/features/pwa/ui"  the client components
 */
export { InstallCard, InstallSection } from "./components/install-views";
export { OfflineCheckinPage } from "./components/offline-page";
export { installLabels, pwaClientLabels } from "./server/labels";
