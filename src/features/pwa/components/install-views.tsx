import { getTranslations } from "next-intl/server";

import { installLabels } from "../server/labels";
import { InstallPrompt } from "./install-prompt";

/** After the first check-in (§13): the install card, before the push question on iPhone (D-127). */
export async function InstallCard() {
  return <InstallPrompt labels={await installLabels()} mode="card" />;
}

/** Settings: install this device, or that it's installed. */
export async function InstallSection() {
  const [t, labels] = await Promise.all([getTranslations("pwa.install"), installLabels()]);
  return (
    <section className="profile-section" aria-labelledby="install-app">
      <h2 id="install-app" className="profile-section__title">
        {t("settingsTitle")}
      </h2>
      <InstallPrompt labels={labels} mode="settings" />
    </section>
  );
}
