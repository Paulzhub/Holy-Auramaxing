import { getTranslations } from "next-intl/server";

import { buttonVariants } from "@/components/ui/button-variants";
import { Link } from "@/i18n/navigation";

import { FOUNDER } from "../articles";
import { FAQ_KEYS } from "../faq";
import { faqPageLd, webApplicationLd } from "../seo/json-ld";
import { CONTACT_EMAIL } from "../site";
import { Breadcrumbs, PageIntro } from "./breadcrumbs";
import { JsonLd } from "./json-ld";

const HOW_SECTIONS = ["checkIn", "grace", "levels", "groups", "partners", "sos", "scripture", "privacy"] as const;

export async function HowItWorks() {
  const t = await getTranslations("marketing");
  return (
    <div className="public-content">
      <JsonLd data={webApplicationLd(t("pages.home.description"))} />
      <Breadcrumbs trail={[{ name: t("howItWorks.title"), path: "/how-it-works" }]} />
      <PageIntro title={t("howItWorks.title")} lede={t("howItWorks.lede")} />
      <ol className="how-steps">
        {HOW_SECTIONS.map((key) => (
          <li key={key} className="how-steps__item">
            <section aria-labelledby={`how-${key}`}>
              <h2 id={`how-${key}`}>{t(`howItWorks.sections.${key}.heading`)}</h2>
              <p>{t(`howItWorks.sections.${key}.body`)}</p>
            </section>
          </li>
        ))}
      </ol>
      <p>
        <Link href="/sign-up" className={buttonVariants({ size: "lg" })}>
          {t("howItWorks.cta")}
        </Link>
      </p>
    </div>
  );
}

export async function About() {
  const t = await getTranslations("marketing");
  return (
    <div className="public-content">
      <Breadcrumbs trail={[{ name: t("about.title"), path: "/about" }]} />
      <PageIntro title={t("about.title")} lede={t("about.lede")} />
      {(["why", "believe"] as const).map((key) => (
        <section key={key} className="public-section" aria-labelledby={`about-${key}`}>
          <h2 id={`about-${key}`}>{t(`about.sections.${key}.heading`)}</h2>
          <p>{t(`about.sections.${key}.body`)}</p>
        </section>
      ))}
      <section className="public-section" aria-labelledby="about-isnt">
        <h2 id="about-isnt">{t("about.sections.isnt.heading")}</h2>
        <p>{t("about.sections.isnt.body")}</p>
        <p>
          <Link href="/get-help" className="text-link">
            {t("about.sections.isnt.help")}
          </Link>
        </p>
      </section>
      <section className="public-section" aria-labelledby="about-who">
        <h2 id="about-who">{t("about.sections.who.heading")}</h2>
        <p>{t.rich("articles.person", { ...FOUNDER, b: (chunks) => <strong>{chunks}</strong> })}</p>
        <p>
          {t.rich("about.sections.who.contact", {
            email: CONTACT_EMAIL,
            mail: (chunks) => (
              <a className="text-link" href={`mailto:${CONTACT_EMAIL}`}>
                {chunks}
              </a>
            ),
          })}
        </p>
      </section>
    </div>
  );
}

export async function Faq() {
  const t = await getTranslations("marketing");
  const items = FAQ_KEYS.map((key) => ({ key, question: t(`faq.items.${key}.q`), answer: t(`faq.items.${key}.a`) }));
  return (
    <div className="public-content">
      <JsonLd data={faqPageLd(items)} />
      <Breadcrumbs trail={[{ name: t("faq.title"), path: "/faq" }]} />
      <PageIntro title={t("faq.title")} lede={t("faq.lede")} />
      <div className="faq-sections">
        {items.map((item) => (
          <section key={item.key} className="faq-item" aria-labelledby={`faq-${item.key}`}>
            <h2 id={`faq-${item.key}`}>{item.question}</h2>
            <p>{item.answer}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
