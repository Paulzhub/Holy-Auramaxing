import type { Metadata } from "next";

import { isIndexablePath } from "../pages";
import { OG_SIZE } from "./og-size";
import { absoluteUrl, SITE_NAME } from "../site";

interface PublicMetadataInput {
  /** The page's own title; the layout's template adds " | Holy Auramaxing". */
  title: string;
  /** Use the title as is, without the template (the landing page). */
  absoluteTitle?: boolean;
  description: string;
  /** Site path without a locale prefix, e.g. "/faq". */
  path: string;
  type?: "website" | "article";
  /** The card picture: "site", or an article's slug (src/app/api/og). */
  image?: string;
  /** ISO dates, for articles. */
  published?: string;
  modified?: string;
}

/**
 * Metadata for a public page (CLAUDE.md §12): unique title and description,
 * the canonical address, Open Graph and Twitter cards with a generated
 * picture (src/app/api/og). Pages that aren't on the
 * indexable list (an article awaiting review) get noindex.
 */
export function publicMetadata(input: PublicMetadataInput): Metadata {
  const indexable = isIndexablePath(input.path);
  const ogTitle = input.absoluteTitle ? input.title : `${input.title} | ${SITE_NAME}`;
  const image = { url: ogImagePath(input.image ?? "site"), width: OG_SIZE.width, height: OG_SIZE.height, alt: ogTitle };
  return {
    title: input.absoluteTitle ? { absolute: input.title } : input.title,
    description: input.description,
    alternates: { canonical: input.path },
    robots: indexable ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: {
      type: input.type ?? "website",
      siteName: SITE_NAME,
      locale: "en",
      url: absoluteUrl(input.path),
      title: ogTitle,
      description: input.description,
      images: [image],
      ...(input.type === "article" ? { publishedTime: input.published, modifiedTime: input.modified } : {}),
    },
    twitter: { card: "summary_large_image", title: ogTitle, description: input.description, images: [image] },
  };
}

/** Where a card picture is served (src/app/api/og/[name]/route.tsx). */
export function ogImagePath(name: string): string {
  return `/api/og/${name}`;
}
