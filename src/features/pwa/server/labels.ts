import { getTranslations } from "next-intl/server";

import type { InstallLabels } from "../components/install-prompt";
import type { PwaClientLabels } from "../components/pwa-client";

/** The words for the shell's helper, from the server (no message bundle in the browser). */
export async function pwaClientLabels(): Promise<PwaClientLabels> {
  const t = await getTranslations("pwa");
  return {
    synced: t.raw("synced.one") as string,
    noteLost: t("synced.noteLost"),
    updateTitle: t("update.title"),
    updateBody: t("update.body"),
    refresh: t("update.refresh"),
    later: t("update.later"),
  };
}

export async function installLabels(): Promise<InstallLabels> {
  const t = await getTranslations("pwa.install");
  return {
    title: t("title"),
    body: t("body"),
    install: t("install"),
    notNow: t("notNow"),
    iosTitle: t("iosTitle"),
    iosBody: t("iosBody"),
    iosShow: t("iosShow"),
    iosStep1: t("iosStep1"),
    iosStep2: t("iosStep2"),
    iosStep3: t("iosStep3"),
    close: t("close"),
    installed: t("installed"),
    unavailable: t("unavailable"),
    installedNow: t("installedNow"),
  };
}
