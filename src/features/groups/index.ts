/**
 * groups module — groups, membership, roles, invites and covenants
 * (CLAUDE.md §6, §7.4). Phase 3.
 *
 * Public API, in several entry points (other modules may import only these):
 *   "@/features/groups"            server code and server components (this file)
 *   "@/features/groups/ui"         the header's group switcher (client, on every page)
 *   "@/features/groups/ui-create"  the create-group wizard (client)
 *   "@/features/groups/ui-manage"  settings, picture and invite forms (client)
 *   "@/features/groups/ui-join"    joining with an invite or a code (client)
 */
export { groupPhase, todayIn, type GroupPhase } from "./lifecycle";
export { groupPictureUrl } from "./picture-url";
export {
  getGroupInvites,
  getGroupMembers,
  getMyGroups,
  getOpenProposal,
  requireGroup,
  type Group,
  type GroupContext,
  type MemberCard,
  type MyGroupItem,
} from "./server/queries";
export { detailsOfHeldInvite, handleInviteLink, previewHeldInvite, type InviteDetails } from "./server/join";
export { exportGroupsData } from "./server/export";
export { serveGroupPicture } from "./server/picture";

// Server components: no JavaScript reaches the browser for these.
export {
  CovenantSummary,
  DangerZone,
  GroupHeader,
  GroupHomeSkeleton,
  GroupList,
  GroupNotice,
  LeaveGroupSection,
  MemberList,
  PhaseText,
  ProposalCard,
} from "./components/group-views";
