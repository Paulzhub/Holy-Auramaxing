/**
 * social module — the encouragement wall, reactions, report and block
 * (CLAUDE.md §7.7, §7.11), Phase 6a; nudges, partners, asking for prayer
 * and milestone cards, Phase 6b; live updates and reactions on check-ins,
 * Phase 6c.
 *
 * Public API, in two entry points (other modules may import only these):
 *   "@/features/social"          server code and server components (this file)
 *   "@/features/social/ui"       the post and comment forms (client)
 *   "@/features/social/ui-live"  live updates on a group's pages (client)
 */
export {
  NUDGE_KINDS,
  PARTNERS_MAX,
  POST_KINDS,
  REACTION_KINDS,
  REPORT_REASONS,
  SOCIAL_LIMITS,
  WALL_FILTERS,
} from "./constants";
export type { NudgeKind, PostKind, ReactionKind, ReportReason, WallFilter } from "./constants";
export { parseWallQuery } from "./schemas";
export {
  getBlockedPeople,
  getGroupReports,
  getPostWithComments,
  getWall,
  type BlockedPerson,
  type OpenReport,
  type WallComment,
  type WallPage,
  type WallPost,
} from "./server/queries";
export {
  getCheckinReactions,
  getGroupNudgesMuted,
  getLiveTopic,
  getMyActivePartners,
  getMyNudges,
  getMyPartnerships,
  getNudgeTargets,
  getSocialSettings,
  type ActivePartner,
  type CheckinReaction,
  type Partnership,
  type ReceivedNudge,
  type SocialSettings,
} from "./server/accountability";
export { exportSocialData } from "./server/export";
export { askGroupForPrayer, sendPartnerSos } from "./server/sos";

// Server components: no JavaScript reaches the browser for these.
export {
  BlockedList,
  CheckinReactions,
  CommentList,
  MemberSafetyTools,
  ModerationList,
  PostCard,
  SocialNotice,
  WallFilters,
  WallHomeCard,
  WallList,
  type WallViewer,
} from "./components/wall-views";
export {
  AskForPrayerCard,
  GroupNudgeSettings,
  NudgeControl,
  NudgesForYou,
  PartnerPanel,
  SocialSettingsCard,
} from "./components/accountability-views";
