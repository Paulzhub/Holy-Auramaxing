"use client";

import { HeartHandshake, Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Link } from "@/i18n/navigation";

import { orderedCrisisLines } from "../crisis-lines";
import { mentionsSelfHarm } from "../crisis-match";

/**
 * Watches one text field and, if what's typed sounds like self-harm, gently
 * shows crisis lines under it (CLAUDE.md §7.9, D-109). Matching happens here,
 * in the browser: nothing is sent, logged or blocked because of it, and
 * saving works exactly as before. Once shown, the card stays until the page
 * changes, so it doesn't flicker while someone keeps typing.
 */
export function CrisisWatch({ fieldId, timeZone }: { fieldId: string; timeZone?: string | null }) {
  const t = useTranslations("sos.crisis");
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Listen on the document: a form may replace its field after saving.
    let timer = 0;
    const read = () => {
      const field = document.getElementById(fieldId);
      return field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement ? field.value : "";
    };
    const check = (event?: Event) => {
      if (event && (event.target as HTMLElement | null)?.id !== fieldId) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (mentionsSelfHarm(read())) setShow(true);
      }, 400);
    };
    check();
    document.addEventListener("input", check);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("input", check);
    };
  }, [fieldId]);

  if (!show) return null;
  const tz = timeZone ?? (typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : null);
  const [first, second] = orderedCrisisLines(tz);
  return (
    <aside className="crisis-card" aria-labelledby={`${fieldId}-crisis-title`} data-testid="crisis-card">
      <h3 id={`${fieldId}-crisis-title`} className="crisis-card__title">
        <HeartHandshake aria-hidden="true" /> {t("title")}
      </h3>
      <p>{t("body")}</p>
      <ul className="crisis-card__lines">
        {[first, second].map((line) =>
          line ? (
            <li key={line.code}>
              <a className="ui-button ui-button--secondary" href={`tel:${line.dial}`}>
                <Phone aria-hidden="true" /> {t("call", { name: `${line.name} (${line.country})`, phone: line.phone })}
              </a>
            </li>
          ) : null,
        )}
      </ul>
      <p>{t("emergency")}</p>
      <p>
        <Link href="/resources" className="text-link">
          {t("more")}
        </Link>
      </p>
      <p className="text-muted">{t("private")}</p>
    </aside>
  );
}
