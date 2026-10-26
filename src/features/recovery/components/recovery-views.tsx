import { CircleAlert, Info, LifeBuoy, Lock, Phone } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import type { Flash } from "@/lib/server/flash";

import { JOURNAL_PROMPTS, promptOfTheDay, RECOVERY_LIMITS } from "../constants";
import { FIND_A_HELPLINE, orderedCrisisLines } from "../crisis-lines";
import { deleteJournalAction, partnerContactAction, saveJournalAction } from "../server/actions";
import type { JournalEntry, JournalPage } from "../server/queries";
import { CrisisWatch } from "./crisis-watch";

/**
 * Recovery pages (CLAUDE.md §7.9). Server components: plain forms that work
 * without JavaScript; only the crisis card under a text field is a client
 * component, and it sends nothing anywhere.
 */

const dateOptions = (timeZone: string) =>
  ({ dateStyle: "medium", timeStyle: "short", timeZone }) satisfies Intl.DateTimeFormatOptions;

// ---------------------------------------------------------------- the journal

const journalNotices = new Set(["journal", "journalDeleted"]);
const journalErrors = new Set(["journalInvalid", "journalFailed", "rateLimited"]);

/** The one-minute note after a save (D-098), focused on arrival (D-103). */
export async function JournalNotice({ flash }: { flash: Flash }) {
  const t = await getTranslations("journal.notices");
  if (flash.error && journalErrors.has(flash.error)) {
    return (
      <p className="auth-banner auth-banner--error" role="alert">
        <CircleAlert aria-hidden="true" />
        <span>{t(flash.error as "journalInvalid")}</span>
      </p>
    );
  }
  if (flash.saved && journalNotices.has(flash.saved)) {
    return (
      <p className="auth-banner" role="status">
        <Info aria-hidden="true" />
        <span>{t(flash.saved as "journal")}</span>
      </p>
    );
  }
  return null;
}

export async function JournalWriteCard({ localDate, timeZone }: { localDate: string; timeZone: string }) {
  const t = await getTranslations("journal");
  const today = promptOfTheDay(localDate);
  return (
    <Card as="section" aria-labelledby="journal-write-title">
      <form action={saveJournalAction} className="grid gap-3">
        <CardTitle as="h2" id="journal-write-title">
          {t("newHeading")}
        </CardTitle>
        <div className="ui-field">
          <label className="ui-label" htmlFor="journal-prompt">
            {t("promptLabel")}
          </label>
          <p className="ui-hint" id="journal-prompt-hint">
            {t("promptHint")}
          </p>
          <select
            id="journal-prompt"
            name="prompt"
            className="ui-input"
            defaultValue={today}
            aria-describedby="journal-prompt-hint"
          >
            <option value="">{t("promptNone")}</option>
            {JOURNAL_PROMPTS.map((key) => (
              <option key={key} value={key}>
                {t(`prompts.${key}` as "prompts.p01")}
              </option>
            ))}
          </select>
        </div>
        <div className="ui-field">
          <label className="ui-label" htmlFor="journal-body">
            {t("bodyLabel")}
          </label>
          <textarea
            id="journal-body"
            name="body"
            className="ui-input journal-text"
            rows={8}
            maxLength={RECOVERY_LIMITS.journalMax}
            required
          />
        </div>
        <CrisisWatch fieldId="journal-body" timeZone={timeZone} />
        <p className="ui-hint journal-private">
          <Lock aria-hidden="true" className="inline-icon" /> {t("private")}
        </p>
        <div>
          <button type="submit" className={buttonVariants({ variant: "primary" })}>
            {t("save")}
          </button>
        </div>
      </form>
    </Card>
  );
}

export async function JournalList({
  page,
  timeZone,
  isFirst,
}: {
  page: JournalPage;
  timeZone: string;
  isFirst: boolean;
}) {
  const t = await getTranslations("journal");
  const format = await getFormatter();
  return (
    <section aria-labelledby="journal-list-title" className="grid gap-3">
      <h2 id="journal-list-title" className="section-title">
        {t("listHeading")}
      </h2>
      {page.entries.length === 0 && isFirst ? <p className="text-muted">{t("empty")}</p> : null}
      <ul className="journal-list">
        {page.entries.map((entry) => (
          <li key={entry.id}>
            <article className="ui-card journal-item" aria-labelledby={`entry-${entry.id}`}>
              <h3 id={`entry-${entry.id}`} className="journal-item__date">
                {t("written", { date: format.dateTime(new Date(entry.createdAt), dateOptions(timeZone)) })}
              </h3>
              {entry.promptKey ? (
                <p className="journal-item__prompt">{t(`prompts.${entry.promptKey}` as "prompts.p01")}</p>
              ) : null}
              <p className="journal-item__preview">{entry.body ? preview(entry.body) : t("unreadable")}</p>
              <p>
                <Link href={`/journal/${entry.id}`} className="text-link">
                  {t("open")}
                  <span className="visually-hidden">
                    {": "}
                    {t("written", { date: format.dateTime(new Date(entry.createdAt), dateOptions(timeZone)) })}
                  </span>
                </Link>
              </p>
            </article>
          </li>
        ))}
      </ul>
      <nav className="journal-pages" aria-label={t("listHeading")}>
        {!isFirst ? (
          <Link href="/journal" className="text-link">
            {t("newest")}
          </Link>
        ) : null}
        {page.next ? (
          <Link
            href={`/journal?before=${encodeURIComponent(page.next.before)}&id=${page.next.id}`}
            className="text-link"
          >
            {t("older")}
          </Link>
        ) : null}
      </nav>
    </section>
  );
}

/** The entry's first line, in full: it wraps, never cut short with "…" (§9). */
function preview(body: string): string {
  return body.split("\n").find((line) => line.trim()) ?? "";
}

export async function JournalEntryView({ entry, timeZone }: { entry: JournalEntry; timeZone: string }) {
  const t = await getTranslations("journal");
  const format = await getFormatter();
  return (
    <div className="stack">
      <Card as="section" aria-labelledby="journal-entry-title">
        <form action={saveJournalAction} className="grid gap-3">
          <input type="hidden" name="id" value={entry.id} />
          <CardTitle as="h2" id="journal-entry-title">
            {t("written", { date: format.dateTime(new Date(entry.createdAt), dateOptions(timeZone)) })}
          </CardTitle>
          {entry.updatedAt !== entry.createdAt ? (
            <p className="text-muted">
              {t("edited", { date: format.dateTime(new Date(entry.updatedAt), dateOptions(timeZone)) })}
            </p>
          ) : null}
          {entry.promptKey ? (
            <p className="journal-item__prompt">{t(`prompts.${entry.promptKey}` as "prompts.p01")}</p>
          ) : null}
          <div className="ui-field">
            <label className="ui-label" htmlFor="journal-body">
              {t("bodyLabel")}
            </label>
            <textarea
              id="journal-body"
              name="body"
              className="ui-input journal-text"
              rows={10}
              maxLength={RECOVERY_LIMITS.journalMax}
              required
              defaultValue={entry.body}
            />
          </div>
          <CrisisWatch fieldId="journal-body" timeZone={timeZone} />
          <div className="sos-buttons">
            <button type="submit" className={buttonVariants({ variant: "primary" })}>
              {t("update")}
            </button>
            <Link href="/journal" className={buttonVariants({ variant: "ghost" })}>
              {t("back")}
            </Link>
          </div>
        </form>
      </Card>
      <details className="journal-delete">
        <summary>{t("delete")}</summary>
        <form action={deleteJournalAction} className="grid gap-3">
          <input type="hidden" name="id" value={entry.id} />
          <p>{t("deleteConfirm")}</p>
          <div>
            <button type="submit" className={buttonVariants({ variant: "secondary" })}>
              {t("delete")}
            </button>
          </div>
        </form>
      </details>
    </div>
  );
}

// ---------------------------------------------------------------- resources

export async function ResourcesView({ timeZone }: { timeZone: string | null }) {
  const t = await getTranslations("resources");
  const lines = orderedCrisisLines(timeZone);
  const filters = ["dns", "android", "iphone", "windows"] as const;
  const counsellor = ["c1", "c2", "c3"] as const;
  const books = ["b1", "b2", "b3", "b4"] as const;
  return (
    <div className="stack">
      <Card as="section" aria-labelledby="crisis-title">
        <div className="grid gap-3">
          <CardTitle as="h2" id="crisis-title">
            {t("crisisHeading")}
          </CardTitle>
          <p>{t("crisisBody")}</p>
          <p className="crisis-emergency">{t("crisisEmergency")}</p>
          <ul className="crisis-lines">
            {lines.map((line) => (
              <li key={line.code} className="crisis-line">
                <div className="crisis-line__text">
                  <p className="crisis-line__country">{line.country}</p>
                  <p className="crisis-line__name">{line.name}</p>
                  <p className="text-muted">{line.hours === "24/7" ? t("crisisAllDay") : t("crisisVaries")}</p>
                </div>
                <a
                  className="ui-button ui-button--secondary"
                  href={`tel:${line.dial}`}
                  aria-label={`${t("crisisCall", { phone: line.phone })}, ${line.name}, ${line.country}`}
                >
                  <Phone aria-hidden="true" /> {t("crisisCall", { phone: line.phone })}
                </a>
              </li>
            ))}
          </ul>
          <p>
            <a className="text-link" href={FIND_A_HELPLINE} rel="noopener noreferrer" target="_blank">
              {t("crisisOther")}
            </a>
          </p>
        </div>
      </Card>

      <Card as="section" aria-labelledby="sos-help-title">
        <div className="grid gap-3">
          <CardTitle as="h2" id="sos-help-title">
            <LifeBuoy aria-hidden="true" className="inline-icon" /> {t("sosHeading")}
          </CardTitle>
          <p>{t("sosBody")}</p>
        </div>
      </Card>

      <Card as="section" aria-labelledby="filters-title">
        <div className="grid gap-3">
          <CardTitle as="h2" id="filters-title">
            {t("filtersHeading")}
          </CardTitle>
          <p>{t("filtersBody")}</p>
          {filters.map((key) => (
            <section key={key} className="resource-item" aria-labelledby={`filter-${key}`}>
              <h3 id={`filter-${key}`} className="resource-item__title">
                {t(`filters.${key}.title`)}
              </h3>
              <p>{t(`filters.${key}.body`)}</p>
            </section>
          ))}
        </div>
      </Card>

      <Card as="section" aria-labelledby="counsellor-title">
        <div className="grid gap-3">
          <CardTitle as="h2" id="counsellor-title">
            {t("counsellorHeading")}
          </CardTitle>
          <p>{t("counsellorBody")}</p>
          <ul className="resource-list">
            {counsellor.map((key) => (
              <li key={key}>{t(`counsellor.${key}`)}</li>
            ))}
          </ul>
        </div>
      </Card>

      <Card as="section" aria-labelledby="books-title">
        <div className="grid gap-3">
          <CardTitle as="h2" id="books-title">
            {t("booksHeading")}
          </CardTitle>
          <p>{t("booksBody")}</p>
          <ul className="resource-list">
            {books.map((key) => (
              <li key={key}>{t(`books.${key}`)}</li>
            ))}
          </ul>
        </div>
      </Card>

      <p className="text-muted">{t("notMedical")}</p>
    </div>
  );
}

// ---------------------------------------------------------------- the number partners can call

const contactNotices = new Set(["phoneSaved", "phoneRemoved"]);
const contactErrors = new Set(["phoneInvalid", "phoneFailed", "phoneRateLimited"]);
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export async function RecoveryNotice({
  notice,
  error,
}: {
  notice: string | string[] | undefined;
  error: string | string[] | undefined;
}) {
  const t = await getTranslations("recovery.contact.notices");
  const n = first(notice);
  const e = first(error);
  if (e && contactErrors.has(e)) {
    return (
      <p className="auth-banner auth-banner--error" role="alert">
        <CircleAlert aria-hidden="true" />
        <span>{t(e as "phoneInvalid")}</span>
      </p>
    );
  }
  if (n && contactNotices.has(n)) {
    return (
      <p className="auth-banner" role="status">
        <Info aria-hidden="true" />
        <span>{t(n as "phoneSaved")}</span>
      </p>
    );
  }
  return null;
}

export async function PartnerContactCard({ phone }: { phone: string | null }) {
  const t = await getTranslations("recovery.contact");
  return (
    <div className="grid gap-3">
      <CardTitle as="h2">{t("title")}</CardTitle>
      <p className="text-muted">{t("body")}</p>
      <form action={partnerContactAction} className="grid gap-3">
        <div className="ui-field">
          <label className="ui-label" htmlFor="partner-phone">
            {t("label")}
          </label>
          <p className="ui-hint" id="partner-phone-hint">
            {t("hint")}
          </p>
          <input
            id="partner-phone"
            name="phone"
            type="tel"
            className="ui-input"
            autoComplete="tel"
            inputMode="tel"
            maxLength={RECOVERY_LIMITS.phoneMaxChars}
            defaultValue={phone ?? ""}
            aria-describedby="partner-phone-hint"
          />
        </div>
        <div className="sos-buttons">
          <button type="submit" className={buttonVariants({ variant: "secondary" })}>
            {t("save")}
          </button>
          {phone ? (
            <button type="submit" name="remove" value="1" className={buttonVariants({ variant: "ghost" })}>
              {t("remove")}
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
