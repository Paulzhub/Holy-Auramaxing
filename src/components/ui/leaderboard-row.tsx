import { EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

import { Avatar } from "./avatar";
import type { PreviewState } from "./preview";
import { Skeleton } from "./skeleton";

export interface LeaderboardRowProps {
  rank: number;
  name: string;
  /** Already-formatted score, e.g. "1,240 XP" or "12 days". */
  value: string;
  avatarSrc?: string;
  isMe?: boolean;
  /** Member opted out of leaderboards: name and photo are hidden. */
  hidden?: boolean;
  href?: string;
  preview?: PreviewState;
}

/** One row of a group leaderboard. Render inside <ol className="ui-leaderboard">. */
export function LeaderboardRow({ rank, name, value, avatarSrc, isMe, hidden, href, preview }: LeaderboardRowProps) {
  const t = useTranslations("ui.leaderboard");
  const displayName = hidden ? t("hiddenMember") : name;

  const content = (
    <>
      <span className="ui-lb-row__rank">
        <span className="visually-hidden">{t("rank")} </span>
        {rank}
      </span>
      {hidden ? (
        <span className="ui-avatar ui-avatar--md" aria-hidden="true">
          <EyeOff className="h-4 w-4" />
        </span>
      ) : (
        <Avatar name={name} src={avatarSrc} decorative />
      )}
      <span className="ui-lb-row__name">
        <span>{displayName}</span>
        {isMe ? <span className="ui-tag">{t("you")}</span> : null}
      </span>
      <span className="ui-lb-row__value">{value}</span>
    </>
  );

  const className = cn("ui-lb-row", isMe && "ui-lb-row--me");

  return (
    <li>
      {href && !hidden ? (
        <Link href={href} className={className} data-preview={preview}>
          {content}
        </Link>
      ) : (
        <div className={className} data-preview={preview}>
          {content}
        </div>
      )}
    </li>
  );
}

export function LeaderboardRowSkeleton() {
  return (
    <li aria-hidden="true">
      <div className="ui-lb-row">
        <Skeleton className="mx-auto h-5 w-5" />
        <Skeleton shape="circle" className="h-10 w-10" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-12" />
      </div>
    </li>
  );
}
