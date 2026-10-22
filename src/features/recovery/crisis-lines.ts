/**
 * Crisis lines by country (CLAUDE.md §7.9, D-109). Each number was checked on
 * 2026-10-22 against the list at en.wikipedia.org/wiki/List_of_suicide_crisis_lines
 * and the service's own pages where reachable; check again before launch and
 * every six months. Everyone else is pointed to findahelpline.com.
 */
export interface CrisisLine {
  country: string;
  /** ISO 3166-1 alpha-2. */
  code: string;
  name: string;
  /** As people dial it. */
  phone: string;
  /** For the tel: link. */
  dial: string;
  hours: "24/7" | "varies";
}

export const CRISIS_LINES: readonly CrisisLine[] = [
  { country: "India", code: "IN", name: "Tele-MANAS", phone: "14416", dial: "14416", hours: "24/7" },
  {
    country: "United States",
    code: "US",
    name: "988 Suicide & Crisis Lifeline",
    phone: "988",
    dial: "988",
    hours: "24/7",
  },
  { country: "Canada", code: "CA", name: "9-8-8 Suicide Crisis Helpline", phone: "988", dial: "988", hours: "24/7" },
  { country: "United Kingdom", code: "GB", name: "Samaritans", phone: "116 123", dial: "116123", hours: "24/7" },
  { country: "Ireland", code: "IE", name: "Samaritans", phone: "116 123", dial: "116123", hours: "24/7" },
  { country: "Australia", code: "AU", name: "Lifeline", phone: "13 11 14", dial: "131114", hours: "24/7" },
  { country: "New Zealand", code: "NZ", name: "Need to Talk? 1737", phone: "1737", dial: "1737", hours: "24/7" },
  { country: "Philippines", code: "PH", name: "NCMH Crisis Hotline", phone: "1553", dial: "1553", hours: "24/7" },
  { country: "Singapore", code: "SG", name: "Samaritans of Singapore", phone: "1767", dial: "1767", hours: "24/7" },
  { country: "Malaysia", code: "MY", name: "Talian HEAL", phone: "15555", dial: "15555", hours: "varies" },
  { country: "South Africa", code: "ZA", name: "SADAG", phone: "0800 567 567", dial: "0800567567", hours: "24/7" },
  { country: "Germany", code: "DE", name: "TelefonSeelsorge", phone: "116 123", dial: "116123", hours: "24/7" },
  { country: "France", code: "FR", name: "3114", phone: "3114", dial: "3114", hours: "24/7" },
  { country: "Brazil", code: "BR", name: "CVV", phone: "188", dial: "188", hours: "24/7" },
];

export const FIND_A_HELPLINE = "https://findahelpline.com";

/** The country a time zone most likely means, for ordering the list (never sent anywhere). */
const ZONES: Record<string, string> = {
  "Asia/Kolkata": "IN",
  "Asia/Calcutta": "IN",
  "Europe/London": "GB",
  "Europe/Dublin": "IE",
  "Asia/Manila": "PH",
  "Asia/Singapore": "SG",
  "Asia/Kuala_Lumpur": "MY",
  "Africa/Johannesburg": "ZA",
  "Europe/Berlin": "DE",
  "Europe/Paris": "FR",
  "Pacific/Auckland": "NZ",
};

export function countryForTimeZone(timeZone: string | null | undefined): string | null {
  if (!timeZone) return null;
  if (ZONES[timeZone]) return ZONES[timeZone]!;
  if (timeZone.startsWith("Australia/")) return "AU";
  if (timeZone.startsWith("America/Sao_Paulo") || timeZone.startsWith("America/Fortaleza")) return "BR";
  if (/^America\/(Toronto|Vancouver|Edmonton|Winnipeg|Halifax|St_Johns|Regina)/.test(timeZone)) return "CA";
  if (/^America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Detroit)|^Pacific\/Honolulu/.test(timeZone))
    return "US";
  return null;
}

/** The person's own country first (if we have it), then India and the US, then the rest. */
export function orderedCrisisLines(timeZone: string | null | undefined): CrisisLine[] {
  const mine = countryForTimeZone(timeZone);
  const rank = (l: CrisisLine) => (l.code === mine ? 0 : l.code === "IN" ? 1 : l.code === "US" ? 2 : 3);
  return [...CRISIS_LINES].sort((a, b) => rank(a) - rank(b));
}
