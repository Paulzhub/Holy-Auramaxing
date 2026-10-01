"use client";

import { LifeBuoy } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

/**
 * Always visible, one tap away. Phase 8 replaces the placeholder content
 * with the breathing timer, Scripture cards and quick actions.
 */
export function SosButton() {
  const t = useTranslations("sos");
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className="sos-button" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <LifeBuoy aria-hidden="true" />
        {t("button")}
      </button>
      <Dialog
        variant="sheet"
        open={open}
        onOpenChange={setOpen}
        title={t("title")}
        description={t("description")}
        closeLabel={t("close")}
        footer={
          <Button variant="primary" onClick={() => setOpen(false)}>
            {t("done")}
          </Button>
        }
      >
        <p>{t("breathe")}</p>
        <figure className="verse">
          <blockquote>
            <p>{t("verseText")}</p>
          </blockquote>
          <figcaption>{t("verseReference")}</figcaption>
        </figure>
        <section className="grid gap-1">
          <h3 className="font-display text-(length:--text-lg)">{t("prayerHeading")}</h3>
          <p>{t("prayer")}</p>
        </section>
        <p className="text-muted text-(length:--text-sm)">{t("comingSoon")}</p>
      </Dialog>
    </>
  );
}
