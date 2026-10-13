import { Bell, CircleAlert, Info } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { buttonVariants } from "@/components/ui/button-variants";
import { EmptyState } from "@/components/ui/empty-state";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

import { markAllReadAction, markReadAction } from "../server/actions";
import type { NotificationPage } from "../server/queries";
import { notificationText } from "../text";

/**
 * The notification centre (CLAUDE.md §7.8, D-089). Server-rendered: each
 * item is a plain link to /api/notifications/<id>/open (marked read, then on
 * to where it leads), never prefetched; "Mark as read" and "Mark all as read"
 * are forms, so everything works without JavaScript.
 */

type Params = string | string[] | undefined;
const first = (v: Params) => (Array.isArray(v) ? v[0] : v);
const NOTICES = ["read", "allRead"] as const;
const ERRORS = ["rateLimited", "failed"] as const;

/** A known ?notice= or ?error= value; anything else is ignored. */
export async function NotificationNotice({
  notice,
  error,
  scope = "centre",
}: {
  notice: Params;
  error: Params;
  scope?: "centre" | "settings";
}) {
  const t = await getTranslations(`notifications.${scope}`);
  const n = first(notice);
  const e = first(error);
  const errors: readonly string[] =
    scope === "centre" ? ERRORS : ["invalidInput", "rateLimited", "failed", "notification_locked"];
  const notices: readonly string[] = scope === "centre" ? NOTICES : ["saved", "snoozed", "awake"];
  if (e && errors.includes(e)) {
    return (
      <p className="auth-banner auth-banner--error" role="alert">
        <CircleAlert aria-hidden="true" />
        <span>{t(`errors.${e}` as never)}</span>
      </p>
    );
  }
  if (n && notices.includes(n)) {
    return (
      <p className="auth-banner" role="status">
        <Info aria-hidden="true" />
        <span>{t(`notices.${n}` as never)}</span>
      </p>
    );
  }
  return null;
}

function olderHref(next: NonNullable<NotificationPage["next"]>): string {
  return `/alerts?${new URLSearchParams({ before: next.at, id: next.id }).toString()}`;
}

export async function NotificationCentre({ page, timeZone }: { page: NotificationPage; timeZone: string }) {
  const [t, tAll, tPage, format] = await Promise.all([
    getTranslations("notifications"),
    getTranslations(),
    getTranslations("pages.alerts"),
    getFormatter(),
  ]);
  const anyUnread = page.items.some((i) => !i.read);
  const when = (iso: string) =>
    format.dateTime(new Date(iso), { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone });

  return (
    <div className="stack">
      <div className="alerts-toolbar">
        <Link href="/settings/notifications" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          {t("centre.settingsLink")}
        </Link>
        {anyUnread ? (
          <form action={markAllReadAction}>
            <button type="submit" className={buttonVariants({ variant: "secondary", size: "sm" })}>
              {t("centre.markAllRead")}
            </button>
          </form>
        ) : null}
      </div>
      {page.items.length ? (
        <ol className="alerts-list" aria-label={t("centre.listLabel")} data-testid="alerts-list">
          {page.items.map((item) => {
            const text = notificationText(item, t, tAll);
            return (
              <li key={item.id} className={cn("alert-item", !item.read && "alert-item--unread")}>
                <a href={`/api/notifications/${item.id}/open`} className="alert-item__link">
                  {!item.read ? <span className="visually-hidden">{t("centre.unreadLabel")}: </span> : null}
                  <span className="alert-item__text">{text}</span>
                  <span className="alert-item__meta">
                    {item.groupName ? `${t("inGroup", { group: item.groupName })} · ` : null}
                    <time dateTime={item.createdAt}>{when(item.createdAt)}</time>
                  </span>
                </a>
                {!item.read ? (
                  <form action={markReadAction}>
                    <input type="hidden" name="id" value={item.id} />
                    <button
                      type="submit"
                      className={buttonVariants({ variant: "ghost", size: "sm" })}
                      aria-label={t("centre.markReadFor", { item: text })}
                    >
                      {t("centre.markRead")}
                    </button>
                  </form>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <EmptyState icon={<Bell className="h-6 w-6" />} title={tPage("emptyTitle")} body={tPage("emptyBody")} />
      )}
      {page.next ? (
        <div>
          <Link href={olderHref(page.next)} className={buttonVariants({ variant: "secondary" })} prefetch={false}>
            {t("centre.older")}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
