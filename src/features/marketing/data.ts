/**
 * The public website's plain data (D-114): no React, so the proxy, the
 * sitemap, robots.txt and llms.txt can import it.
 */
export { ARTICLES, articleBySlug, type Article } from "./articles";
export { llmsText } from "./llms";
export {
  AI_CRAWLERS,
  articlePath,
  indexablePaths,
  isIndexablePath,
  NEVER_CRAWLED,
  PUBLIC_PAGES,
  publicPaths,
  SCRIPTURE_PLAN_PATHS,
} from "./pages";
export { absoluteUrl, CONTACT_EMAIL, SITE_NAME, siteUrl } from "./site";
