import { FileWarning } from "lucide-react";
import { getTranslations } from "next-intl/server";

import type en from "../../../messages/en.json";

type Doc = "privacy" | "terms" | "yourData";
type SectionKey<D extends Doc> = keyof (typeof en)["legal"][D]["sections"] & string;

/** Section order for each document; keys live in messages/<locale>.json under legal.<doc>.sections. */
const order: { [D in Doc]: SectionKey<D>[] } = {
  privacy: [
    "whoWeAre",
    "whatWeCollectAndWhy",
    "whatWeNeverDo",
    "whoProcessesDataForUs",
    "howLongWeKeepIt",
    "yourRights",
    "children",
    "grievanceOfficer",
  ],
  terms: ["whoCanUseTheApp", "notAMedicalService", "lookingAfterEachOther", "yourAccount", "changes"],
  yourData: ["privateByDefault", "discreetEverywhere", "yoursToTakeOrDelete", "protected"],
};

/**
 * A plain-language policy page. Paragraphs in a section's body are separated
 * by blank lines. Every page carries a visible "draft pending legal review"
 * notice (CLAUDE.md §11).
 */
export async function LegalPage({ doc }: { doc: Doc }) {
  const t = await getTranslations("legal");
  // Keys are checked by the `order` table's types above.
  const text = (key: string) => t(`${doc}.${key}` as Parameters<typeof t>[0]);

  return (
    <article className="legal">
      <header className="auth-heading">
        <h1 className="page-title">{text("title")}</h1>
        <p className="page-lede">{text("lede")}</p>
      </header>
      <p className="legal__draft" role="note">
        <FileWarning aria-hidden="true" />
        <span>{t("draftNotice")}</span>
      </p>
      <p className="text-muted">{t("updated", { date: t("updatedDate") })}</p>
      {(order[doc] as string[]).map((key) => (
        <section key={key} aria-labelledby={`section-${key}`}>
          <h2 id={`section-${key}`}>{text(`sections.${key}.heading`)}</h2>
          {text(`sections.${key}.body`)
            .split("\n\n")
            .map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
        </section>
      ))}
    </article>
  );
}
