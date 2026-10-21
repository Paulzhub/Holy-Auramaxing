import { cookies } from "next/headers";

/**
 * A one-minute note from a form to the page it returns to ("Saved.", "That
 * didn't work"), carried in a cookie instead of the address (privacy review
 * 2, D-098). Some answers are only possible after one kind of check-in, so a
 * result in the address (`?saved=1`, `?prayer=…`, `#reflection`) would tell
 * anyone reading the browser history, or the host's request logs, which kind
 * it was. The address stays exactly what it was before the form was sent.
 *
 * httpOnly, and gone after a minute. A
 * server-rendered page can't delete a cookie, so a reload within that minute
 * shows the same note again; the page only shows it for the same date.
 */

const NAME = "notice";
const MAX_AGE_SECONDS = 60;
const VALUE = /^(\d{4}-\d{2}-\d{2})\.(saved|error|prayer)\.([A-Za-z0-9_]{1,40})$/;

export type FlashField = "saved" | "error" | "prayer";
export type Flash = Partial<Record<FlashField, string>>;

export function encodeFlash(date: string, field: FlashField, code: string): string | null {
  const value = `${date}.${field}.${code}`;
  return VALUE.test(value) ? value : null;
}

/** The note for this date, or nothing. */
export function decodeFlash(value: string | undefined, date: string): Flash {
  const match = value ? VALUE.exec(value) : null;
  if (!match || match[1] !== date) return {};
  return { [match[2] as FlashField]: match[3]! };
}

export const flashCookieOptions = {
  path: "/",
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: MAX_AGE_SECONDS,
};

/** In a server action, before redirecting back to the page. */
export async function setFlash(date: string, field: FlashField, code: string): Promise<void> {
  const value = encodeFlash(date, field, code);
  if (value) (await cookies()).set(NAME, value, flashCookieOptions);
}

/** In the page. */
export async function readFlash(date: string): Promise<Flash> {
  return decodeFlash((await cookies()).get(NAME)?.value, date);
}
