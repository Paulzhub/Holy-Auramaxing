"use client";

import { Settings } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

import { isActive, navItems } from "./nav-items";

export function BottomNav() {
  const t = useTranslations("nav");
  const tShell = useTranslations("shell");
  const pathname = usePathname();

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

  return (
    <nav aria-label={tShell("mainNav")}>
      <ul>
        {items.map(({ href, key, icon: Icon }) => (
          <li key={href}>
            <Link href={href} className="nav-link" aria-current={isActive(pathname, href) ? "page" : undefined}>
              <Icon aria-hidden="true" />
              {t(key)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
