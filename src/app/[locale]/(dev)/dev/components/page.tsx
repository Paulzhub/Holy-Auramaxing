import { HandHeart } from "lucide-react";
import type { Metadata } from "next";
import { useLocale, useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/shell/app-shell";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { DayStatus } from "@/components/ui/calendar-grid";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LeaderboardRow, LeaderboardRowSkeleton } from "@/components/ui/leaderboard-row";
import { ProgressRing } from "@/components/ui/progress-ring";
import { Skeleton } from "@/components/ui/skeleton";
import { StreakCalendar } from "@/components/ui/streak-calendar";
import { TextField } from "@/components/ui/text-field";
import { ToastView } from "@/components/ui/toast";
import { isDevPagesEnabled } from "@/lib/env";

import { DialogDemo, ReactionDemo, ReactionStatic, SheetDemo, TabsDemo, ToastDemo } from "./_components/demos";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("components") };
}

type StateKey = "default" | "hover" | "focus" | "active" | "disabled" | "loading" | "error";

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="dev-section">
      <h2 id={id} className="dev-section__title">
        {title}
      </h2>
      <div className="dev-states">{children}</div>
    </section>
  );
}

function State({ state, wide, children }: { state: StateKey; wide?: boolean; children: ReactNode }) {
  const t = useTranslations("dev.states");
  return (
    <div className={wide ? "dev-state dev-state--wide" : "dev-state"}>
      <h3 className="dev-state__label">{t(state)}</h3>
      <div className="dev-state__body">{children}</div>
    </div>
  );
}

function NotApplicable({ state, reason }: { state: StateKey; reason: string }) {
  const t = useTranslations("dev");
  return (
    <State state={state}>
      <p className="text-muted">{t("notApplicable", { reason })}</p>
    </State>
  );
}

const calendarDays: Record<string, DayStatus> = Object.fromEntries(
  Array.from({ length: 23 }, (_, i) => {
    const day = i + 1;
    const status: DayStatus = day === 9 ? "slipped" : day === 15 || day === 16 ? "none" : "clean";
    return [`2026-09-${String(day).padStart(2, "0")}`, status];
  }),
);

export default function ComponentsPage() {
  if (!isDevPagesEnabled()) notFound();

  const t = useTranslations("dev");
  const tUi = useTranslations("ui");
  const locale = useLocale();
  const names = { a: t("names.a"), b: t("names.b"), c: t("names.c"), d: t("names.d") };

  return (
    <>
      <PageHeader title={t("title")} lede={t("lede")} />
      <div className="stack dev-gallery">
        {/* ---------------- Button ---------------- */}
        <Section id="button" title={t("button.title")}>
          <State state="default">
            <Button>{t("button.primary")}</Button>
            <Button variant="secondary">{t("button.secondary")}</Button>
            <Button variant="ghost">{t("button.ghost")}</Button>
          </State>
          <State state="hover">
            <Button preview="hover">{t("button.primary")}</Button>
            <Button variant="secondary" preview="hover">
              {t("button.secondary")}
            </Button>
            <Button variant="ghost" preview="hover">
              {t("button.ghost")}
            </Button>
          </State>
          <State state="focus">
            <Button preview="focus">{t("button.primary")}</Button>
            <Button variant="secondary" preview="focus">
              {t("button.secondary")}
            </Button>
            <Button variant="ghost" preview="focus">
              {t("button.ghost")}
            </Button>
          </State>
          <State state="active">
            <Button preview="active">{t("button.primary")}</Button>
            <Button variant="secondary" preview="active">
              {t("button.secondary")}
            </Button>
            <Button variant="ghost" preview="active">
              {t("button.ghost")}
            </Button>
          </State>
          <State state="disabled">
            <Button disabled>{t("button.primary")}</Button>
            <Button variant="secondary" disabled>
              {t("button.secondary")}
            </Button>
          </State>
          <State state="loading">
            <Button loading loadingLabel={tUi("saving")}>
              {t("button.save")}
            </Button>
            <Button variant="secondary" loading loadingLabel={tUi("saving")}>
              {t("button.save")}
            </Button>
          </State>
          <State state="error">
            <div className="grid justify-items-start gap-2">
              <Button aria-describedby="button-error">{t("button.save")}</Button>
              <p className="ui-error-text" id="button-error">
                {t("button.errorMessage")}
              </p>
            </div>
          </State>
          <div className="dev-state">
            <h3 className="dev-state__label">{t("button.sizes")}</h3>
            <div className="dev-state__body">
              <Button size="sm">{t("button.small")}</Button>
              <Button>{t("button.medium")}</Button>
              <Button size="lg">{t("button.large")}</Button>
            </div>
          </div>
        </Section>

        {/* ---------------- Input ---------------- */}
        <Section id="input" title={t("input.title")}>
          <State state="default">
            <TextField
              id="name-default"
              label={t("input.label")}
              hint={t("input.hint")}
              placeholder={t("input.placeholder")}
              autoComplete="nickname"
            />
          </State>
          <State state="hover">
            <TextField id="name-hover" label={t("input.label")} preview="hover" autoComplete="nickname" />
          </State>
          <State state="focus">
            <TextField id="name-focus" label={t("input.label")} preview="focus" autoComplete="nickname" />
          </State>
          <NotApplicable state="active" reason={t("input.noActive")} />
          <State state="disabled">
            <TextField
              id="name-disabled"
              label={t("input.label")}
              defaultValue={names.a}
              disabled
              autoComplete="nickname"
            />
          </State>
          <State state="loading">
            <TextField
              id="name-loading"
              label={t("input.label")}
              defaultValue={names.b}
              loading
              loadingLabel={t("input.checking")}
              autoComplete="nickname"
            />
          </State>
          <State state="error">
            <TextField
              id="name-error"
              label={t("input.label")}
              defaultValue="J"
              error={t("input.error")}
              autoComplete="nickname"
            />
          </State>
        </Section>

        {/* ---------------- Card ---------------- */}
        <Section id="card" title={t("card.title")}>
          <State state="default">
            <Card>
              <CardTitle>{t("card.heading")}</CardTitle>
              <p className="text-muted">{t("card.body")}</p>
            </Card>
          </State>
          <State state="hover">
            <Card preview="hover">
              <CardTitle>{t("card.linkHeading")}</CardTitle>
              <p className="text-muted">{t("card.linkBody")}</p>
            </Card>
          </State>
          <State state="focus">
            <a href="#card" className="ui-card">
              <span className="ui-card__title">{t("card.linkHeading")}</span>
              <span className="text-muted block">{t("card.linkBody")}</span>
            </a>
          </State>
          <State state="active">
            <Card preview="active">
              <CardTitle>{t("card.linkHeading")}</CardTitle>
              <p className="text-muted">{t("card.linkBody")}</p>
            </Card>
          </State>
          <State state="disabled">
            <Card aria-disabled="true">
              <CardTitle>{t("card.disabledHeading")}</CardTitle>
              <p className="text-muted">{t("card.disabledBody")}</p>
            </Card>
          </State>
          <State state="loading">
            <Card aria-busy="true">
              <span className="visually-hidden">{tUi("loading")}</span>
              <div className="grid gap-3">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-4 w-full" />
              </div>
            </Card>
          </State>
          <State state="error">
            <Card tone="error">
              <CardTitle>{t("card.errorHeading")}</CardTitle>
              <p className="text-muted">{t("card.errorBody")}</p>
            </Card>
          </State>
        </Section>

        {/* ---------------- Dialog ---------------- */}
        <Section id="dialog" title={t("dialog.title")}>
          <State state="default">
            <DialogDemo />
          </State>
          <State state="focus">
            <div className="grid gap-2">
              <p className="text-muted">{t("dialog.staticNote")}</p>
              <div className="ui-dialog ui-dialog--static">
                <div className="ui-dialog__inner">
                  <p className="ui-dialog__title font-display font-semibold">{t("dialog.heading")}</p>
                  <p className="text-muted">{t("dialog.body")}</p>
                  <div className="ui-dialog__footer">
                    <Button variant="ghost">{t("dialog.cancel")}</Button>
                    <Button preview="focus">{t("dialog.confirm")}</Button>
                  </div>
                </div>
              </div>
            </div>
          </State>
          <NotApplicable state="hover" reason={t("dialog.noHover")} />
          <NotApplicable state="disabled" reason={t("dialog.noDisabled")} />
        </Section>

        {/* ---------------- Bottom sheet ---------------- */}
        <Section id="sheet" title={t("sheet.title")}>
          <State state="default">
            <SheetDemo />
          </State>
          <NotApplicable state="hover" reason={t("dialog.noHover")} />
          <NotApplicable state="disabled" reason={t("dialog.noDisabled")} />
        </Section>

        {/* ---------------- Tabs ---------------- */}
        <Section id="tabs" title={t("tabs.title")}>
          <State state="default" wide>
            <TabsDemo />
          </State>
          <State state="hover">
            <div className="ui-tabs__list">
              <span className="ui-tabs__trigger" data-preview="hover">
                {t("tabs.level")}
              </span>
            </div>
          </State>
          <State state="focus">
            <div className="ui-tabs__list">
              <span className="ui-tabs__trigger" data-state="active" data-preview="focus">
                {t("tabs.consistency")}
              </span>
            </div>
          </State>
          <State state="active">
            <div className="ui-tabs__list">
              <span className="ui-tabs__trigger" data-state="active">
                {t("tabs.consistency")}
              </span>
              <span className="ui-tabs__trigger" data-preview="active">
                {t("tabs.streak")}
              </span>
            </div>
          </State>
          <NotApplicable state="loading" reason={t("tabs.noLoading")} />
        </Section>

        {/* ---------------- Toast ---------------- */}
        <Section id="toast" title={t("toast.title")}>
          <State state="default">
            <ToastDemo />
          </State>
          <State state="default">
            <ol className="m-0 grid list-none gap-2 p-0">
              <ToastView
                announce={false}
                dismissLabel={tUi("dismiss")}
                toast={{ tone: "info", title: t("toast.infoTitle"), description: t("toast.infoBody") }}
              />
              <ToastView
                announce={false}
                dismissLabel={tUi("dismiss")}
                toast={{ tone: "success", title: t("toast.successTitle"), description: t("toast.successBody") }}
              />
            </ol>
          </State>
          <State state="error">
            <ol className="m-0 grid list-none gap-2 p-0">
              <ToastView
                announce={false}
                dismissLabel={tUi("dismiss")}
                toast={{ tone: "error", title: t("toast.errorTitle"), description: t("toast.errorBody") }}
              />
            </ol>
          </State>
        </Section>

        {/* ---------------- Avatar ---------------- */}
        <Section id="avatar" title={t("avatar.title")}>
          <State state="default">
            <Avatar name={names.a} src="/dev/avatar-sample.svg" size="lg" />
            <Avatar name={names.a} src="/dev/avatar-sample.svg" />
            <Avatar name={names.b} size="lg" />
            <Avatar name={names.c} />
            <Avatar name={names.d} size="sm" />
          </State>
          <State state="loading">
            <span aria-busy="true" className="inline-flex gap-3">
              <span className="visually-hidden">{tUi("loading")}</span>
              <Skeleton shape="circle" className="h-16 w-16" />
              <Skeleton shape="circle" className="h-10 w-10" />
            </span>
          </State>
          <State state="error">
            <Avatar name={names.c} src="/dev/does-not-exist.png" size="lg" />
            <p className="text-muted">{t("avatar.brokenImage")}</p>
          </State>
        </Section>

        {/* ---------------- Progress ring ---------------- */}
        <Section id="ring" title={t("ring.title")}>
          <State state="default">
            <ProgressRing
              value={3}
              max={10}
              label={t("ring.label")}
              valueText={t("ring.valueText", { value: 3, max: 10 })}
            >
              <span className="ui-ring__value-text">{3}</span>
              <span className="ui-ring__caption">{t("ring.caption", { max: 10 })}</span>
            </ProgressRing>
            <ProgressRing value={5} max={5} size="sm" label={t("ring.label")} valueText={t("ring.complete")}>
              <span className="ui-ring__value-text">{5}</span>
            </ProgressRing>
            <ProgressRing
              value={7}
              max={10}
              size="lg"
              label={t("ring.label")}
              valueText={t("ring.valueText", { value: 7, max: 10 })}
            >
              <span className="ui-ring__value-text">{7}</span>
              <span className="ui-ring__caption">{t("ring.caption", { max: 10 })}</span>
            </ProgressRing>
          </State>
          <State state="loading">
            <ProgressRing value={0} max={10} loading label={t("ring.label")} valueText="" />
          </State>
        </Section>

        {/* ---------------- Streak calendar ---------------- */}
        <Section id="calendar" title={t("calendar.title")}>
          <State state="default" wide>
            <StreakCalendar year={2026} month={9} days={calendarDays} today="2026-09-24" locale={locale} />
          </State>
          <NotApplicable state="hover" reason={t("calendar.noInteractive")} />
        </Section>

        {/* ---------------- Leaderboard row ---------------- */}
        <Section id="leaderboard" title={t("leaderboard.title")}>
          <State state="default">
            <ol className="ui-leaderboard w-full">
              <LeaderboardRow
                rank={1}
                name={names.a}
                avatarSrc="/dev/avatar-sample.svg"
                value={t("leaderboard.xp", { value: 1240 })}
                href="/home"
              />
              <LeaderboardRow rank={2} name={names.b} value={t("leaderboard.xp", { value: 1185 })} isMe />
              <LeaderboardRow rank={3} name={names.c} value={t("leaderboard.xp", { value: 990 })} hidden />
            </ol>
          </State>
          <State state="hover">
            <ol className="ui-leaderboard w-full">
              <LeaderboardRow
                rank={4}
                name={names.d}
                value={t("leaderboard.xp", { value: 870 })}
                href="/home"
                preview="hover"
              />
            </ol>
          </State>
          <State state="focus">
            <ol className="ui-leaderboard w-full">
              <LeaderboardRow
                rank={4}
                name={names.d}
                value={t("leaderboard.xp", { value: 870 })}
                href="/home"
                preview="focus"
              />
            </ol>
          </State>
          <State state="active">
            <ol className="ui-leaderboard w-full">
              <LeaderboardRow
                rank={4}
                name={names.d}
                value={t("leaderboard.xp", { value: 870 })}
                href="/home"
                preview="active"
              />
            </ol>
          </State>
          <State state="loading">
            <div aria-busy="true" className="w-full">
              <span className="visually-hidden">{tUi("loading")}</span>
              <ol className="ui-leaderboard">
                <LeaderboardRowSkeleton />
                <LeaderboardRowSkeleton />
              </ol>
            </div>
          </State>
        </Section>

        {/* ---------------- Reaction bar ---------------- */}
        <Section id="reactions" title={t("reactions.title")}>
          <State state="default">
            <ReactionDemo />
          </State>
          <State state="hover">
            <ReactionStatic
              reactions={[{ kind: "heart", count: 2, mine: false }]}
              preview={{ kind: "heart", state: "hover" }}
            />
          </State>
          <State state="focus">
            <ReactionStatic
              reactions={[{ kind: "heart", count: 2, mine: false }]}
              preview={{ kind: "heart", state: "focus" }}
            />
          </State>
          <State state="active">
            <ReactionStatic
              reactions={[{ kind: "pray", count: 4, mine: true }]}
              preview={{ kind: "pray", state: "active" }}
            />
          </State>
          <State state="disabled">
            <ReactionStatic
              reactions={[
                { kind: "fire", count: 3, mine: false },
                { kind: "dove", count: 1, mine: true },
              ]}
              disabled
            />
          </State>
          <State state="loading">
            <ReactionStatic reactions={[{ kind: "strong", count: 1, mine: false }]} pending="strong" />
          </State>
        </Section>

        {/* ---------------- Empty state ---------------- */}
        <Section id="empty" title={t("empty.title")}>
          <State state="default">
            <EmptyState
              headingLevel="h3"
              icon={<HandHeart className="h-6 w-6" />}
              title={t("empty.heading")}
              body={t("empty.body")}
              action={<Button variant="secondary">{t("empty.action")}</Button>}
            />
          </State>
        </Section>

        {/* ---------------- Skeleton ---------------- */}
        <Section id="skeleton" title={t("skeleton.title")}>
          <State state="loading">
            <div aria-busy="true" className="grid w-full gap-3">
              <span className="visually-hidden">{tUi("loading")}</span>
              <div className="flex items-center gap-3">
                <Skeleton shape="circle" className="h-10 w-10" />
                <div className="grid flex-1 gap-2">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
              <Skeleton className="h-24 w-full" />
            </div>
          </State>
          <NotApplicable state="focus" reason={t("skeleton.noInteractive")} />
        </Section>
      </div>
    </>
  );
}
