"use client";

import { ChevronDown, Plus, Users } from "lucide-react";
import { useEffect, useRef } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Link, usePathname } from "@/i18n/navigation";

export interface SwitcherGroup {
  id: string;
  name: string;
  pictureUrl?: string;
}

export interface SwitcherLabels {
  label: string;
  none: string;
  all: string;
  create: string;
}

/**
 * The group switcher in the header (CLAUDE.md §7.4). A native <details>
 * disclosure, so it works without JavaScript; with it, it closes on Escape,
 * on a click outside and after choosing a group. Labels come from the
 * server, so no extra messages ship on every page. Unread counts arrive
 * with notifications (Phase 7).
 */
export function GroupSwitcher({ groups, labels }: { groups: SwitcherGroup[]; labels: SwitcherLabels }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();
  const currentId = /^\/groups\/([0-9a-f-]{36})/.exec(pathname)?.[1];
  const current = groups.find((g) => g.id === currentId);

  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [pathname]);

  useEffect(() => {
    const details = ref.current;
    if (!details) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && details.open) {
        details.open = false;
        details.querySelector("summary")?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (details.open && e.target instanceof Node && !details.contains(e.target)) details.open = false;
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick);
    };
  }, []);

  return (
    <details ref={ref} className="group-switcher">
      <summary className="group-switcher__summary">
        {current ? (
          <Avatar name={current.name} src={current.pictureUrl} size="sm" shape="square" decorative />
        ) : (
          <Users aria-hidden="true" />
        )}
        <span className="visually-hidden">{labels.label}</span>
        {current ? (
          <span className="group-switcher__current">{current.name}</span>
        ) : (
          <span className="group-switcher__current" aria-hidden="true">
            {labels.label}
          </span>
        )}
        <ChevronDown aria-hidden="true" className="group-switcher__chevron" />
      </summary>
      <div className="group-switcher__panel">
        {groups.length ? (
          <ul className="group-switcher__list" aria-label={labels.label}>
            {groups.map((g) => (
              <li key={g.id}>
                <Link
                  href={`/groups/${g.id}`}
                  className="group-switcher__item"
                  aria-current={g.id === currentId ? "page" : undefined}
                >
                  <Avatar name={g.name} src={g.pictureUrl} size="sm" shape="square" decorative />
                  <span>{g.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="group-switcher__empty">{labels.none}</p>
        )}
        <div className="group-switcher__footer">
          <Link href="/groups" className="group-switcher__item">
            <Users aria-hidden="true" />
            <span>{labels.all}</span>
          </Link>
          <Link href="/groups/new" className="group-switcher__item">
            <Plus aria-hidden="true" />
            <span>{labels.create}</span>
          </Link>
        </div>
      </div>
    </details>
  );
}
