import { Bell, CircleCheck, CircleUser, House, Users, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: "/home" | "/groups" | "/check-in" | "/alerts" | "/me";
  key: "home" | "groups" | "checkIn" | "alerts" | "me";
  icon: LucideIcon;
  primary?: boolean;
}

export const navItems: NavItem[] = [
  { href: "/home", key: "home", icon: House },
  { href: "/groups", key: "groups", icon: Users },
  { href: "/check-in", key: "checkIn", icon: CircleCheck, primary: true },
  { href: "/alerts", key: "alerts", icon: Bell },
  { href: "/me", key: "me", icon: CircleUser },
];

/** True when `pathname` is the item's page or one of its sub-pages. */
export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
