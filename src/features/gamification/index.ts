/**
 * gamification module — levels (5a), XP and badges (5b), leaderboards, the
 * Together total and the group goal (5c) (CLAUDE.md §7.6). Phase 5.
 *
 * This file is the module's public API. Other modules import only from
 * "@/features/gamification", never from its internal folders (enforced by ESLint).
 */
export { daysForLevel, daysToNext, levelLabel, levelVariant, replay, tierNumber, type ReplayDay } from "./levels";
export { levelChangeAfterSave, type LevelChange } from "./level-change";
export { canShareLevel, shareCardText } from "./share-card";
export {
  getMyLevel,
  getMyXpAndBadges,
  type Badge,
  type EarnedBadge,
  type LevelOverview,
  type XpAndBadges,
} from "./server/queries";
export { LEVEL_CHANGE_ID, LevelCard, LevelChangeNotice } from "./components/level-views";
export { BADGE_SLUGS } from "./badges";
export { exportGamificationData } from "./server/export";
export { MemberBadges, XpBadgesCard, XpLine } from "./components/badge-views";
export {
  BOARDS,
  PAGE_SIZE,
  PREVIEW_SIZE,
  boardHasWeek,
  boardHref,
  goalPercent,
  parseBoardQuery,
  type Board,
  type GoalPeriod,
  type Period,
} from "./leaderboards";
export {
  getLeaderboard,
  getTogether,
  type BoardPage,
  type BoardRow,
  type GroupGoal,
  type Together,
} from "./server/leaderboards";
export { LeaderboardBoard, LeaderboardPreview, TogetherCard } from "./components/leaderboard-views";
