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
export { getAccount, requireAccount, type Account, type AccountProfile } from "./server/account";
export { finishOAuthSignIn, signOutIncompleteAccount, verifyEmailLink } from "./server/oauth";
export { hasAdultAnswer, readSignupTicket } from "./server/tickets";

// Server components: no JavaScript reaches the browser for these.
export { AuthHeading } from "./components/auth-heading";
export { AuthNotice } from "./components/auth-notice";
export { SignOutButton } from "./components/sign-out-button";
