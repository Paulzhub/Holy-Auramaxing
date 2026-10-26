import { LifeBuoy, Phone } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";

import { FIND_A_HELPLINE, orderedCrisisLines } from "../crisis-lines";

/**
 * `audience="public"` is the website's Get help page (§12, D-117): it has no
 * SOS button, so that card points to someone to talk to and to /breathe,
 * which works without an account.
 */
export async function ResourcesView({
  timeZone,
  audience = "app",
}: {
  timeZone: string | null;
  audience?: "app" | "public";
}) {
  const t = await getTranslations("resources");
  const tHelp = await getTranslations("marketing.getHelp");
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
          <p>{audience === "public" ? tHelp("crisisBody") : t("crisisBody")}</p>
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

      {audience === "public" ? (
        <>
          <Card as="section" aria-labelledby="pastor-help-title">
            <div className="grid gap-3">
              <CardTitle as="h2" id="pastor-help-title">
                {tHelp("pastorHeading")}
              </CardTitle>
              <p>{tHelp("pastorBody")}</p>
            </div>
          </Card>
          <Card as="section" aria-labelledby="sos-help-title">
            <div className="grid gap-3">
              <CardTitle as="h2" id="sos-help-title">
                <LifeBuoy aria-hidden="true" className="inline-icon" /> {tHelp("breatheHeading")}
              </CardTitle>
              <p>{tHelp("breatheBody")}</p>
              <p>
                <Link href="/breathe" className={buttonVariants({ variant: "secondary" })}>
                  {tHelp("breatheLink")}
                </Link>
              </p>
            </div>
          </Card>
        </>
      ) : (
        <Card as="section" aria-labelledby="sos-help-title">
          <div className="grid gap-3">
            <CardTitle as="h2" id="sos-help-title">
              <LifeBuoy aria-hidden="true" className="inline-icon" /> {t("sosHeading")}
            </CardTitle>
            <p>{t("sosBody")}</p>
          </div>
        </Card>
      )}

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
