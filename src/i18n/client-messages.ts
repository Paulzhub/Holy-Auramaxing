import { getMessages } from "next-intl/server";

/**
 * Messages are shipped to the browser as JavaScript, so each part of the app
 * passes its client components only the namespaces they use. Server
 * components read every message on the server at no cost to the browser.
 * (A test checks that every useTranslations() call in a client component
 * is covered.)
 */
export const baseClientNamespaces = ["app", "meta", "errors", "theme", "nav", "shell", "sos", "ui"] as const;

type Messages = Awaited<ReturnType<typeof getMessages>>;
type Namespace = keyof Messages & string;

export async function clientMessages(extra: readonly Namespace[] = []): Promise<Partial<Messages>> {
  const all = await getMessages();
  const picked: Partial<Messages> = {};
  for (const ns of [...baseClientNamespaces, ...extra] as Namespace[]) {
    (picked as Record<string, unknown>)[ns] = all[ns];
  }
  return picked;
}
