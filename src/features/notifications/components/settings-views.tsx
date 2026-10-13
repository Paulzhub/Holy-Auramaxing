import { getFormatter, getTranslations } from "next-intl/server";

import { buttonVariants } from "@/components/ui/button-variants";
import { Link } from "@/i18n/navigation";

import { NOTIFICATION_SECTIONS, NOTIFICATION_TYPES, type NotificationType } from "../constants";
import { saveChannelsAction, saveGroupMutesAction, saveTimingAction, snoozeAction } from "../server/actions";
import type { NotificationSettings } from "../server/queries";

/**
 * Notification settings (CLAUDE.md §7.8, §7.10; D-090): the type-by-channel
 * grid, the reminder time and quiet hours, digest, discreet mode, sound and
 * vibration, snooze, and muting a group. Plain forms, no JavaScript. Each
 * type is a fieldset with its own legend, so the grid reflows at 320 px and
 * every checkbox has a full name ("Push Nudges").
 */

/** The card on the main Settings page. */
export async function NotificationSettingsCard() {
  const t = await getTranslations("notifications.settings");
  return (
    <div className="grid gap-3">
      <p className="text-muted">{t("cardBody")}</p>
      <div>
        <Link href="/settings/notifications" className={buttonVariants({ variant: "secondary" })}>
          {t("cardLink")}
        </Link>
      </div>
    </div>
  );
}

export async function NotificationSettingsPanel({
  settings,
  timeZone,
  devices,
}: {
  settings: NotificationSettings;
  timeZone: string;
  /** Phase 7c: this device's push switch and the list of devices. */
  devices?: React.ReactNode;
}) {
  const [t, format] = await Promise.all([getTranslations("notifications.settings"), getFormatter()]);
  const byType = new Map(settings.channels.map((c) => [c.type, c]));
  const typesIn = (section: string) =>
    (Object.keys(NOTIFICATION_TYPES) as NotificationType[]).filter(
      (type) => NOTIFICATION_TYPES[type].section === section,
    );

  return (
    <div className="stack">
      {devices}

      <section className="profile-section" aria-labelledby="channels">
        <h2 id="channels" className="profile-section__title">
          {t("channelsTitle")}
        </h2>
        <p className="text-muted">{t("channelsLede")}</p>
        {/* Keyed by what's saved: React 19 resets a form after its action, so a
            fresh key brings the new values in. */}
        <form
          action={saveChannelsAction}
          className="notify-grid"
          key={settings.channels.map((c) => `${+c.push}${+c.email}`).join("")}
        >
          {NOTIFICATION_SECTIONS.map((section) => (
            <fieldset key={section} className="notify-grid__section">
              <legend>{t(`sections.${section}`)}</legend>
              {typesIn(section).map((type) => {
                const c = byType.get(type);
                const name = t(`types.${type}`);
                return (
                  <div key={type} className="notify-row">
                    <span className="notify-row__name" id={`type-${type}`}>
                      {name}
                    </span>
                    {c?.locked ? (
                      <span className="text-muted">{t("alwaysOn")}</span>
                    ) : (
                      <span className="notify-row__choices">
                        {(["push", "email"] as const).map((channel) => (
                          <span key={channel} className="auth-check">
                            <input
                              id={`${channel}-${type}`}
                              type="checkbox"
                              name={`${channel}:${type}`}
                              defaultChecked={c?.[channel]}
                              aria-labelledby={`${channel}-${type}-label type-${type}`}
                            />
                            <label htmlFor={`${channel}-${type}`} id={`${channel}-${type}-label`}>
                              {t(channel)}
                            </label>
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                );
              })}
              {section === "people" ? <p className="ui-hint">{t("nudgesNote")}</p> : null}
            </fieldset>
          ))}
          <div>
            <button type="submit" className={buttonVariants({ variant: "primary" })}>
              {t("save")}
            </button>
          </div>
        </form>
      </section>

      <section className="profile-section" aria-labelledby="timing">
        <h2 id="timing" className="profile-section__title">
          {t("timingTitle")}
        </h2>
        <form
          action={saveTimingAction}
          className="wall-form"
          key={[
            settings.reminderTime,
            settings.quietStart,
            settings.quietEnd,
            settings.digest,
            settings.discreet,
            settings.sound,
            settings.vibrate,
          ].join("|")}
        >
          <div className="notify-times">
            <div className="ui-field">
              <label htmlFor="reminderTime" className="ui-label">
                {t("reminderTime")}
              </label>
              <input
                id="reminderTime"
                name="reminderTime"
                type="time"
                className="ui-input"
                defaultValue={settings.reminderTime ?? ""}
                aria-describedby="reminderTime-hint"
              />
              <p className="ui-hint" id="reminderTime-hint">
                {t("reminderHint")}
              </p>
            </div>
            <div className="ui-field">
              <label htmlFor="quietStart" className="ui-label">
                {t("quietStart")}
              </label>
              <input
                id="quietStart"
                name="quietStart"
                type="time"
                required
                className="ui-input"
                defaultValue={settings.quietStart}
                aria-describedby="quiet-hint"
              />
            </div>
            <div className="ui-field">
              <label htmlFor="quietEnd" className="ui-label">
                {t("quietEnd")}
              </label>
              <input
                id="quietEnd"
                name="quietEnd"
                type="time"
                required
                className="ui-input"
                defaultValue={settings.quietEnd}
                aria-describedby="quiet-hint"
              />
            </div>
          </div>
          <p className="ui-hint" id="quiet-hint">
            {t("quietHint")}
          </p>
          <fieldset className="notify-grid__section" aria-describedby="digest-hint">
            <legend>{t("digest")}</legend>
            {(
              [
                ["off", "digestOff"],
                ["daily", "digestDaily"],
                ["weekly", "digestWeekly"],
              ] as const
            ).map(([value, label]) => (
              <span key={value} className="auth-check">
                <input
                  id={`digest-${value}`}
                  type="radio"
                  name="digest"
                  value={value}
                  defaultChecked={settings.digest === value}
                />
                <label htmlFor={`digest-${value}`}>{t(label)}</label>
              </span>
            ))}
            <p className="ui-hint" id="digest-hint">
              {t("digestHint")}
            </p>
          </fieldset>
          <div className="auth-check">
            <input
              id="discreet"
              type="checkbox"
              name="discreet"
              defaultChecked={settings.discreet}
              aria-describedby="discreet-hint"
            />
            <label htmlFor="discreet">{t("discreet")}</label>
          </div>
          <p className="ui-hint" id="discreet-hint">
            {t("discreetHint")}
          </p>
          <div className="auth-check">
            <input id="sound" type="checkbox" name="sound" defaultChecked={settings.sound} />
            <label htmlFor="sound">{t("sound")}</label>
          </div>
          <div className="auth-check">
            <input id="vibrate" type="checkbox" name="vibrate" defaultChecked={settings.vibrate} />
            <label htmlFor="vibrate">{t("vibrate")}</label>
          </div>
          <div>
            <button type="submit" className={buttonVariants({ variant: "secondary" })}>
              {t("save")}
            </button>
          </div>
        </form>
      </section>

      <section className="profile-section" aria-labelledby="snooze">
        <h2 id="snooze" className="profile-section__title">
          {t("snoozeTitle")}
        </h2>
        <p className="text-muted">{t("snoozeLede")}</p>
        {settings.snoozeUntil ? (
          <p role="status">
            {t("snoozedUntil", {
              when: format.dateTime(new Date(settings.snoozeUntil), {
                weekday: "long",
                hour: "numeric",
                minute: "2-digit",
                timeZone,
              }),
            })}
          </p>
        ) : null}
        <div className="alerts-toolbar">
          {settings.snoozeUntil ? (
            <form action={snoozeAction}>
              <input type="hidden" name="for" value="off" />
              <button type="submit" className={buttonVariants({ variant: "secondary" })}>
                {t("snoozeOff")}
              </button>
            </form>
          ) : null}
          <form action={snoozeAction}>
            <input type="hidden" name="for" value="day" />
            <button type="submit" className={buttonVariants({ variant: "secondary" })}>
              {t("snoozeDay")}
            </button>
          </form>
          <form action={snoozeAction}>
            <input type="hidden" name="for" value="week" />
            <button type="submit" className={buttonVariants({ variant: "secondary" })}>
              {t("snoozeWeek")}
            </button>
          </form>
        </div>
      </section>

      <section className="profile-section" aria-labelledby="groups">
        <h2 id="groups" className="profile-section__title">
          {t("groupsTitle")}
        </h2>
        <p className="text-muted">{t("groupsLede")}</p>
        {settings.groups.length ? (
          <form
            action={saveGroupMutesAction}
            className="wall-form"
            key={settings.groups.map((g) => `${g.id}:${+g.muted}`).join("|")}
          >
            {settings.groups.map((g) => (
              <div key={g.id} className="auth-check">
                <input type="hidden" name="group" value={g.id} />
                <input id={`mute-${g.id}`} type="checkbox" name="muted" value={g.id} defaultChecked={g.muted} />
                <label htmlFor={`mute-${g.id}`}>{t("muteGroup", { group: g.name })}</label>
              </div>
            ))}
            <div>
              <button type="submit" className={buttonVariants({ variant: "secondary" })}>
                {t("save")}
              </button>
            </div>
          </form>
        ) : (
          <p>{t("noGroups")}</p>
        )}
      </section>
    </div>
  );
}
