import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";

import { breadcrumbLd, type Crumb } from "../seo/json-ld";
import { JsonLd } from "./json-ld";

/**
 * Breadcrumbs for inner public pages (§12): a visible trail and the matching
 * BreadcrumbList. `trail` is everything after Home; the last item is the
 * current page.
 */
export async function Breadcrumbs({ trail }: { trail: readonly Crumb[] }) {
  const t = await getTranslations("marketing.breadcrumb");
  const crumbs: Crumb[] = [{ name: t("home"), path: "/" }, ...trail];
  return (
    <>
      <nav aria-label={t("label")} className="breadcrumbs">
        <ol>
          {crumbs.map((c, i) => (
            <li key={c.path}>
              {i === crumbs.length - 1 ? (
                <span aria-current="page">{c.name}</span>
              ) : (
                <Link href={c.path}>{c.name}</Link>
              )}
            </li>
          ))}
        </ol>
      </nav>
      <JsonLd data={breadcrumbLd(crumbs)} />
    </>
  );
}

export function PageIntro({ title, lede }: { title: string; lede?: string }) {
  return (
    <header className="public-intro">
      <h1 className="page-title">{title}</h1>
      {lede ? <p className="page-lede">{lede}</p> : null}
    </header>
  );
}
