/**
 * The push services browsers use (security review 2, SR2-2, D-094). A
 * subscription's endpoint is where the server POSTs, so only these hosts,
 * on the default port and with no user name, are accepted:
 *   fcm.googleapis.com                Chrome, Edge on Android, Samsung, Opera, Brave
 *   updates.push.services.mozilla.com Firefox
 *   web.push.apple.com                Safari (macOS, and iOS 16.4+ Home Screen apps)
 *   <name>.notify.windows.com         Edge on Windows (WNS)
 * The database has the same list (`util.push_endpoint_ok`); change both together.
 */
export const PUSH_ENDPOINT =
  /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)\/\S*$/;

export function isPushServiceEndpoint(endpoint: string): boolean {
  return endpoint.length <= 1000 && PUSH_ENDPOINT.test(endpoint);
}
