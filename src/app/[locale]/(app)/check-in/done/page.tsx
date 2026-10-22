import { CircleCheck, Sunrise } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { buttonVariants } from "@/components/ui/button-variants";
import { FocusOnArrival } from "@/components/ui/focus-on-arrival";
import { requireAccount } from "@/features/auth";
import {
  CheckinErrorBanner,
  getCheckinFor,
  getCheckinOverview,
  isCheckinErrorKey,
  KeptMessage,
  NextStep,
  ReflectionForm,
  StreakStats,
} from "@/features/checkins";
import {
  getMyLevel,
  LEVEL_CHANGE_ID,
  type LevelChange,
  levelChangeAfterSave,
  LevelChangeNotice,
  type LevelOverview,
} from "@/features/gamification";
import { getMyGroups } from "@/features/groups";
import { getPushDevices, PushExplainer } from "@/features/notifications";
import { AskForPrayerCard, getMyActivePartners } from "@/features/social";
import { Link, redirect } from "@/i18n/navigation";
import { readFlash } from "@/lib/server/flash";

// A neutral tab title for both answers: never anything about a slip (§2.3).
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("checkIn") };
}

type SearchParams = Promise<{ date?: string }>;

const STATUS_ID = "checkin-saved";

/**
 * Arriving from the check-in form, focus lands on the page's heading
 * (FocusAfterAction), which also reads out "Saved" and any level change:
 * the title doesn't change between the two pages, so nothing else would be
 * announced (accessibility review 2, A2-4).
 */
function arrivalHeading(change: LevelChange) {
  return {
    "data-arrival-focus": "",
    tabIndex: -1,
    "aria-describedby": change.kind === "same" ? STATUS_ID : `${STATUS_ID} ${LEVEL_CHANGE_ID}`,
  } as const;
}

type Overview = Awaited<ReturnType<typeof getCheckinOverview>>;
type Checkin = NonNullable<Awaited<ReturnType<typeof getCheckinFor>>>;

/**
 * After a check-in (CLAUDE.md §7.5). One address for both answers, so the
 * browser history, the address bar and the host's request logs never show
 * which answer someone gave (privacy review 1, D-055). What the page shows
 * comes from the saved check-in, never from the URL. The slip page's own
 * forms (the reflection, asking for prayer) come back to this same address
 * and leave their result in a one-minute cookie (privacy review 2, D-098).
 */
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const [{ userId }, overview, query, level] = await Promise.all([
    requireAccount(),
    getCheckinOverview(),
    searchParams,
    getMyLevel(),
  ]);
  const date = query.date && /^\d{4}-\d{2}-\d{2}$/.test(query.date) ? query.date : overview.today;
  const [checkin, flash] = await Promise.all([getCheckinFor(userId, date), readFlash(date)]);
  if (!checkin) {
    redirect({ href: "/check-in", locale: await getLocale() });
    return null;
  }

  return checkin.outcome === "slipped" ? (
    <NewMercies overview={overview} checkin={checkin} date={date} flash={flash} level={level} userId={userId} />
  ) : (
    <Done overview={overview} date={date} level={level} />
  );
}

/** After a clean day: a quiet thank-you, the streak ring and a verse. */
async function Done({ overview, date, level }: { overview: Overview; date: string; level: LevelOverview }) {
  const [t, tForm, format, devices] = await Promise.all([
    getTranslations("checkins.done"),
    getTranslations("checkins.form"),
    getFormatter(),
    getPushDevices(),
  ]);
  const when =
    date === overview.today
      ? tForm("today")
      : format.dateTime(new Date(`${date}T12:00:00Z`), { timeZone: "UTC", weekday: "long" });

  const change = levelChangeAfterSave(level);

  return (
    <div className="stack checkin-result">
      <header className="checkin-result__header">
        <CircleCheck aria-hidden="true" className="checkin-result__icon checkin-icon--clean" />
        <h1 className="page-title" {...arrivalHeading(change)}>
          {t("title")}
        </h1>
        <p className="checkin-result__status" role="status" id={STATUS_ID}>
          {t("status", { day: when })}
        </p>
        <p className="page-lede">{t("lede")}</p>
      </header>
      <LevelChangeNotice change={change} />
      <StreakStats overview={overview} />
      <figure className="verse">
        <blockquote>
          <p>{t("verseText")}</p>
        </blockquote>
        <figcaption>{t("verseReference")}</figcaption>
      </figure>
      <div className="profile-actions">
        <Link href="/home" className={buttonVariants({ variant: "primary" })}>
          {t("homeLink")}
        </Link>
        <Link href="/progress" className={buttonVariants({ variant: "secondary" })}>
          {tForm("progressLink")}
        </Link>
      </div>
      {/* After a check-in, the explainer comes before any browser prompt (§7.8, D-092). */}
      <PushExplainer hasDevice={devices.length > 0} />
    </div>
  );
}

/**
 * The slip flow: grace first. A forgiveness verse, what the person kept
 * (owner's request, D-046), an optional private reflection, a way to ask for
 * prayer, and one next step. No red, no failure words.
 */
async function NewMercies({
  overview,
  checkin,
  date,
  flash,
  level,
  userId,
}: {
  overview: Overview;
  checkin: Checkin;
  date: string;
  flash: { saved?: string; error?: string; prayer?: string };
  level: LevelOverview;
  userId: string;
}) {
  const [t, groups, partners] = await Promise.all([
    getTranslations("checkins.mercies"),
    getMyGroups(userId),
    getMyActivePartners(userId),
  ]);
  const openGroups = groups
    .filter((g) => g.status === "active" && !g.archivedAt)
    .map((g) => ({ id: g.id, name: g.name }));
  const canReflect = overview.openDates.includes(date);
  const change = levelChangeAfterSave(level);

  return (
    <div className="stack mercies">
      <header className="mercies__hero">
        <Sunrise aria-hidden="true" className="mercies__icon" />
        <h1 className="page-title" {...arrivalHeading(change)}>
          {t("title")}
        </h1>
        <p className="checkin-result__status" role="status" id={STATUS_ID}>
          {t("status")}
        </p>
        <p className="page-lede">{t("lede")}</p>
        <figure className="verse mercies__verse">
          <blockquote>
            <p>{t("verseText")}</p>
          </blockquote>
          <figcaption>{t("verseReference")}</figcaption>
        </figure>
      </header>

      <KeptMessage overview={overview} reason="slip" />
      {/* One quiet line, never a celebration or an alarm (§7.6). */}

      <LevelChangeNotice change={change} />

      <CheckinErrorBanner error={isCheckinErrorKey(flash.error) ? flash.error : null} />
      {canReflect ? <ReflectionForm existing={checkin} saved={flash.saved === "1"} /> : null}
      {/* Asking a group or a partner to pray (D-046, Phase 6b). */}
      <AskForPrayerCard date={date} groups={openGroups} partners={partners} result={flash.prayer} />
      {/* Back from one of the forms above: take the person to its result (no #fragment, D-098). */}
      {flash.prayer ? (
        <FocusOnArrival targetId="prayer-title" />
      ) : flash.saved || flash.error ? (
        <FocusOnArrival targetId="reflection" />
      ) : null}
      <NextStep date={date} />

      <div className="profile-actions">
        <Link href="/home" className={buttonVariants({ variant: "primary" })}>
          {t("homeLink")}
        </Link>
      </div>
    </div>
  );
}
