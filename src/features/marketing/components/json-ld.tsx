import { serializeJsonLd, type JsonLd as Data } from "../seo/json-ld";

/**
 * Structured data as a data block. It isn't JavaScript, so CSP's script-src
 * doesn't apply and it needs no nonce; "<" is escaped by serializeJsonLd.
 */
export function JsonLd({ data }: { data: Data | Data[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
