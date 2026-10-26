/**
 * Recovery module: SOS, journal and resources (CLAUDE.md §7.9), Phase 8a.
 * Devotionals and the app lock arrive in Phase 8b.
 *
 * Public API, in two entry points (other modules may import only these):
 *   "@/features/recovery"     server code, server components and the SOS button
 *   "@/features/recovery/ui"  the on-device crisis card for text fields (client)
 */
export { OfflineReady } from "./components/offline-ready";
export { SosButton } from "./components/sos-button";
export { SosOffline } from "./components/sos-offline";
export { CRISIS_LINES, FIND_A_HELPLINE, orderedCrisisLines, type CrisisLine } from "./crisis-lines";
export { mentionsSelfHarm } from "./crisis-match";
export { parseJournalCursor } from "./schemas";
export {
  getJournal,
  getJournalEntry,
  getMyPartnerContact,
  getMyWaves,
  journalFlashDate,
  type JournalEntry,
  type JournalPage,
} from "./server/queries";
export { exportRecoveryData } from "./server/export";
export {
  JournalEntryView,
  JournalList,
  JournalNotice,
  JournalWriteCard,
  PartnerContactCard,
  RecoveryNotice,
  ResourcesView,
} from "./components/recovery-views";
