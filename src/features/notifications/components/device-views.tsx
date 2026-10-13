import { getFormatter, getTranslations } from "next-intl/server";

import { buttonVariants } from "@/components/ui/button-variants";
import { readPublicEnv } from "@/lib/env";

import { removeDeviceAction } from "../server/actions";
import type { PushDevice } from "../server/push";
import { PushControl, type PushLabels } from "../ui-push";

/** The push switch's words, from the server (no message bundle in the browser). */
export async function pushLabels(): Promise<PushLabels> {
  const t = await getTranslations("notifications.device");
  return {
    explainerTitle: t("explainerTitle"),
    explainerBody: t("explainerBody"),
    turnOn: t("turnOn"),
    notNow: t("notNow"),
    on: t("on"),
    turnOff: t("turnOff"),
    off: t("off"),
    blocked: t("blocked"),
    unsupported: t("unsupported"),
    iosTitle: t("iosTitle"),
    iosStep1: t("iosStep1"),
    iosStep2: t("iosStep2"),
    iosStep3: t("iosStep3"),
    working: t("working"),
    failed: t("failed"),
  };
}

/**
 * After a check-in: the explainer, before the browser's own prompt (§7.8).
 * Nothing when push isn't configured, or when this person already has a device.
 */
export async function PushExplainer({ hasDevice }: { hasDevice: boolean }) {
  const key = readPublicEnv().NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key || hasDevice) return null;
  return <PushControl vapidKey={key} labels={await pushLabels()} mode="explainer" />;
}

/** Settings: this device's switch, and every device with Remove. */
export async function DevicesSection({ devices, timeZone }: { devices: PushDevice[]; timeZone: string }) {
  const key = readPublicEnv().NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) return null;
  const [t, ts, format, labels] = await Promise.all([
    getTranslations("notifications.device"),
    getTranslations("notifications.settings"),
    getFormatter(),
    pushLabels(),
  ]);
  return (
    <section className="profile-section" aria-labelledby="devices">
      <h2 id="devices" className="profile-section__title">
        {ts("devicesTitle")}
      </h2>
      <p className="text-muted">{ts("devicesLede")}</p>
      <PushControl vapidKey={key} labels={labels} mode="settings" />
      <h3 className="notify-row__name">{t("listTitle")}</h3>
      {devices.length ? (
        <ul className="alerts-list" data-testid="push-devices">
          {devices.map((d) => {
            const name = d.label || t("unknownDevice");
            return (
              <li key={d.id} className="alert-item">
                <span className="alert-item__link">
                  <span className="alert-item__text">{name}</span>
                  <span className="alert-item__meta">
                    {t("added", { date: format.dateTime(new Date(d.addedAt), { dateStyle: "medium", timeZone }) })}
                  </span>
                </span>
                <form action={removeDeviceAction}>
                  <input type="hidden" name="id" value={d.id} />
                  <button
                    type="submit"
                    className={buttonVariants({ variant: "ghost", size: "sm" })}
                    aria-label={t("removeFor", { device: name })}
                  >
                    {t("remove")}
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      ) : (
        <p>{t("none")}</p>
      )}
    </section>
  );
}
