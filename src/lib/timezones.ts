/**
 * Every IANA zone the runtime knows, plus UTC and any zones already in use
 * (so a saved setting always shows in the list), sorted.
 */
export function timezoneOptions(...current: string[]): string[] {
  return [...new Set([...Intl.supportedValuesOf("timeZone"), "UTC", ...current])].sort();
}
