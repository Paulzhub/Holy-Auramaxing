/**
 * auth module — sign-up (age gate, consent), sign-in, email links, session
 * helpers (CLAUDE.md §7.1). Phase 2.
 *
 * Public API, in two entry points (other modules may import only these):
 *   "@/features/auth"     server functions and server components (this file)
 *   "@/features/auth/ui"  client components (the forms)
 * They are split so that importing a server helper (e.g. requireAccount in a
 * layout) never pulls the sign-in forms into that route's JavaScript.
 */
export { POLICY_VERSION } from "./policy";
export {
  ACCOUNT_DELETION_GRACE_DAYS,
  deletionDate,
  getAccount,
  getTwoStepStatus,
  requireAccount,
  requireSignedInAccount,
  type Account,
  type AccountProfile,
} from "./server/account";
export { exportAuthData } from "./server/data-export";
export { runAccountPurge } from "./server/storage-purge";
export { safeNextPath } from "./schemas";
export { getSecurityOverview, type SecurityOverview } from "./server/security-queries";
export { finishOAuthSignIn, signOutIncompleteAccount, verifyEmailLink } from "./server/oauth";
export { hasAdultAnswer, readSignupTicket } from "./server/tickets";

// Server components: no JavaScript reaches the browser for these.
export { AuthHeading } from "./components/auth-heading";
export { AuthNotice } from "./components/auth-notice";
export { SignOutButton } from "./components/sign-out-button";
export { PasskeyList, SecurityNotice, SessionList, TwoStepOff } from "./components/security-sections";
export { AccountDataNotice, DeleteAccountForm, ExportDataForm, KeepAccountForm } from "./components/account-data";
