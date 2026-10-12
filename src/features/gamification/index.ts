/**
 * gamification module — levels now; XP, badges and leaderboards next
 * (CLAUDE.md §7.6). Phase 5.
 *
 * This file is the module's public API. Other modules import only from
 * "@/features/gamification", never from its internal folders (enforced by ESLint).
 */
export { daysForLevel, daysToNext, levelLabel, levelVariant, replay, tierNumber, type ReplayDay } from "./levels";
export { levelChangeAfterSave, type LevelChange } from "./level-change";
export { canShareLevel, shareCardText } from "./share-card";
export { getMyLevel, type LevelOverview } from "./server/queries";
export { LevelCard, LevelChangeNotice } from "./components/level-views";
