import { Info, LogOut, Monitor } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { buttonVariants } from "@/components/ui/button-variants";

import { removePasskeyAction, renamePasskeyAction } from "../server/passkey-actions";
import {
  disableTwoStepAction,
  revokeSessionAction,
  signOutEverywhereAction,
  signOutOtherSessionsAction,
} from "../server/security-actions";
import type { SecurityOverview } from "../server/security-queries";
import { PASSKEY_NAME_MAX_LENGTH } from "../security-state";

// Server components for Settings → Security. Every control is a plain form
// posting to a Server Action, so none of this needs JavaScript in the browser.

const securityNotices = [
  "two-step-off",
  "recovery-used",
  "passkey-added",
  "passkey-removed",
  "passkey-renamed",
  "passkey-name-invalid",
  "session-signed-out",
  "signed-out-others",
  "rate-limited",
  "failed",
] as const;

/** A known ?notice= value; anything else is ignored, so the URL can't inject text. */
export async function SecurityNotice({ notice }: { notice: string | string[] | undefined }) {
  const value = Array.isArray(notice) ? notice[0] : notice;
  if (!value || !(securityNotices as readonly string[]).includes(value)) return null;
  const t = await getTranslations("security.notices");
  return (
    <p className="auth-banner" role="status">
      <Info aria-hidden="true" />
      <span>{t(value as (typeof securityNotices)[number])}</span>
    </p>
  );
}

export async function TwoStepOff() {
  const t = await getTranslations("security.twoStep");
  return (
    <details className="auth-details">
      <summary>{t("offTitle")}</summary>
      <p className="text-muted">{t("offBody")}</p>
      <form action={disableTwoStepAction}>
        <button type="submit" className={buttonVariants({ variant: "secondary" })}>
          {t("offSubmit")}
        </button>
      </form>
    </details>
  );
}

function dateOptions(timeZone: string) {
  return { dateStyle: "medium", timeStyle: "short", timeZone } as const;
}

export async function PasskeyList({
  passkeys,
  timeZone,
}: {
  passkeys: NonNullable<SecurityOverview["passkeys"]>;
  timeZone: string;
}) {
  const t = await getTranslations("security.passkeys");
  const format = await getFormatter();
  if (passkeys.length === 0) return <p className="text-muted">{t("none")}</p>;

  return (
    <ul className="security-list" aria-label={t("listLabel")}>
      {passkeys.map((passkey) => (
        <li key={passkey.id} className="security-item">
          <div className="security-item__main">
            <p className="security-item__name">{passkey.name}</p>
            <p className="security-item__meta">
              {t("addedOn", { date: format.dateTime(new Date(passkey.createdAt), dateOptions(timeZone)) })}
              {" · "}
              {passkey.lastUsedAt
                ? t("lastUsed", { date: format.dateTime(new Date(passkey.lastUsedAt), dateOptions(timeZone)) })
                : t("neverUsed")}
            </p>
          </div>
          <div className="security-item__actions">
            <details className="auth-details">
              <summary>{t("rename", { name: passkey.name })}</summary>
              <form action={renamePasskeyAction} className="auth-form">
                <input type="hidden" name="passkeyId" value={passkey.id} />
                <div className="ui-field">
                  <label className="ui-label" htmlFor={`passkey-name-${passkey.id}`}>
                    {t("nameLabel")}
                  </label>
                  <div className="ui-input-wrap">
                    <input
                      id={`passkey-name-${passkey.id}`}
                      name="name"
                      className="ui-input"
                      defaultValue={passkey.name}
                      maxLength={PASSKEY_NAME_MAX_LENGTH}
                      autoComplete="off"
                      required
                    />
                  </div>
                </div>
                <div>
                  <button type="submit" className={buttonVariants({ variant: "secondary", size: "sm" })}>
                    {t("save")}
                  </button>
                </div>
              </form>
            </details>
            <details className="auth-details">
              <summary>{t("remove", { name: passkey.name })}</summary>
              <p className="text-muted">{t("removeBody")}</p>
              <form action={removePasskeyAction}>
                <input type="hidden" name="passkeyId" value={passkey.id} />
                <button type="submit" className={buttonVariants({ variant: "secondary", size: "sm" })}>
                  {t("removeSubmit")}
                </button>
              </form>
            </details>
          </div>
        </li>
      ))}
    </ul>
  );
}

export async function SessionList({
  sessions,
  timeZone,
}: {
  sessions: SecurityOverview["sessions"];
  timeZone: string;
}) {
  const t = await getTranslations("security.sessions");
  const format = await getFormatter();
  const hasOthers = sessions.some((s) => !s.isCurrent);

  return (
    <div className="grid gap-4">
      <ul className="security-list" aria-label={t("listLabel")}>
        {sessions.map((session) => {
          const device = session.device ?? t("unknownDevice");
          const lastActive = format.dateTime(new Date(session.lastActiveAt), dateOptions(timeZone));
          return (
            <li key={session.id} className="security-item">
              <Monitor aria-hidden="true" className="security-item__icon" />
              <div className="security-item__main">
                <p className="security-item__name">
                  {device}
                  {session.isCurrent ? <span className="ui-tag">{t("thisDevice")}</span> : null}
                </p>
                <p className="security-item__meta">
                  {t("lastActive", { date: lastActive })}
                  {" · "}
                  {t("signedIn", { date: format.dateTime(new Date(session.signedInAt), dateOptions(timeZone)) })}
                </p>
              </div>
              {session.isCurrent ? null : (
                <form action={revokeSessionAction} className="security-item__actions">
                  <input type="hidden" name="sessionId" value={session.id} />
                  <button
                    type="submit"
                    className={buttonVariants({ variant: "secondary", size: "sm" })}
                    aria-label={t("signOutLabel", { device, date: lastActive })}
                  >
                    {t("signOut")}
                  </button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
      <div className="profile-actions">
        {hasOthers ? (
          <form action={signOutOtherSessionsAction}>
            <button type="submit" className={buttonVariants({ variant: "secondary" })}>
              {t("others")}
            </button>
          </form>
        ) : null}
        <form action={signOutEverywhereAction} className="grid gap-1">
          <button type="submit" className={buttonVariants({ variant: "secondary" })} aria-describedby="everywhere-hint">
            <LogOut aria-hidden="true" />
            {t("everywhere")}
          </button>
          <span id="everywhere-hint" className="ui-hint">
            {t("everywhereBody")}
          </span>
        </form>
      </div>
    </div>
  );
}
