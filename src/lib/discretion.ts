/**
 * Words that give away what the app is for (CLAUDE.md §2.3; D-055), plus
 * "xxx" (the old spelling of the name, D-059). Anything people might see
 * outside the app (a tab, an email, a download, a share card) must not match.
 * src/test/discretion.test.ts uses the same list.
 */
export const SENSITIVE_WORDS =
  /porn|fap|lust|masturbat|sexual|\bsex\b|relapse|addict|temptation|purity|\bslip|\bstreak|\burges?\b|clean day|sobriety|xxx/i;

export function isDiscreet(text: string): boolean {
  return !SENSITIVE_WORDS.test(text);
}
