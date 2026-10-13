"use client";

import { Settings } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

import { countLabel, useAlertCounts } from "./alert-counts";
import { isActive, navItems } from "./nav-items";

/** The unread count on the Alerts item (the bell), announced with the link's name. */
function UnreadBadge({ count }: { count: number }) {
  const t = useTranslations("nav");
  if (count <= 0) return null;
  return (
    <span className="nav-badge" data-testid="unread-badge">
      <span aria-hidden="true">{countLabel(count)}</span>
      <span className="visually-hidden">{t("unreadSuffix", { count })}</span>
    </span>
  );
}

export function BottomNav() {
  const t = useTranslations("nav");
  const tShell = useTranslations("shell");
  const pathname = usePathname();
  const { total } = useAlertCounts();

  return (
    <nav className="shell-bottomnav" aria-label={tShell("mainNav")}>
      <ul>
        {navItems.map(({ href, key, icon: Icon, primary }) => (
          <li key={href}>
            <Link
              href={href}
              className={cn("nav-tab", primary && "nav-tab--primary")}
              aria-current={isActive(pathname, href) ? "page" : undefined}
            >
              <span className="nav-tab__icon">
                <Icon aria-hidden="true" />
                {key === "alerts" ? <UnreadBadge count={total} /> : null}
              </span>
              {t(key)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function SidebarNav() {
  const t = useTranslations("nav");
  const tShell = useTranslations("shell");
  const pathname = usePathname();
  const items = [...navItems, { href: "/settings" as const, key: "settings" as const, icon: Settings }];
  const { total } = useAlertCounts();

  return (
    <nav aria-label={tShell("mainNav")}>
      <ul>
        {items.map(({ href, key, icon: Icon }) => (
          <li key={href}>
            <Link href={href} className="nav-link" aria-current={isActive(pathname, href) ? "page" : undefined}>
              <Icon aria-hidden="true" />
              {t(key)}
              {key === "alerts" ? <UnreadBadge count={total} /> : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
