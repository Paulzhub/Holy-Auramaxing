/**
 * social module — the encouragement wall, reactions, report and block
 * (CLAUDE.md §7.7, §7.11). Phase 6a; nudges and partners arrive in 6b.
 *
 * Public API, in two entry points (other modules may import only these):
 *   "@/features/social"     server code and server components (this file)
 *   "@/features/social/ui"  the post and comment forms (client)
 */
export { POST_KINDS, REACTION_KINDS, REPORT_REASONS, SOCIAL_LIMITS, WALL_FILTERS } from "./constants";
export type { PostKind, ReactionKind, ReportReason, WallFilter } from "./constants";
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
export { exportSocialData } from "./server/export";

// Server components: no JavaScript reaches the browser for these.
export {
  BlockedList,
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
