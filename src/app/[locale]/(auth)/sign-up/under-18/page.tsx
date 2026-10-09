import { Heart } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AuthHeading } from "@/features/auth";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("underEighteen") };
}

const resources = ["parent", "pastor", "teleManas", "us988", "findAHelpline"] as const;

/** Shown when someone answers that they are under 18. No account, no data. */
export default async function UnderEighteenPage() {
  const t = await getTranslations("auth.underEighteen");
  return (
    <div className="auth-card">
      <Heart aria-hidden="true" className="auth-card__icon" />
      <AuthHeading title={t("title")} lede={t("lede")} />
      <p>{t("body")}</p>
      <blockquote className="auth-verse">
        <p>{t("verseText")}</p>
        <footer>{t("verseReference")}</footer>
      </blockquote>
      <h2 className="auth-subheading">{t("resourcesTitle")}</h2>
      <ul className="auth-list">
        {resources.map((key) => (
          <li key={key}>{t(`resources.${key}`)}</li>
        ))}
      </ul>
      <p className="text-muted">{t("nothingStored")}</p>
    </div>
  );
}
