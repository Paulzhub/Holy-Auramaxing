import type { MDXComponents } from "mdx/types";
import type { ComponentPropsWithoutRef } from "react";

/**
 * Required by @next/mdx (App Router). Article bodies (src/content/articles)
 * render as plain HTML styled by `.article-body`; external links open
 * safely, and nothing in MDX runs in the browser.
 */
function Anchor({ href = "", children, ...props }: ComponentPropsWithoutRef<"a">) {
  const external = /^https?:\/\//.test(href);
  return (
    <a className="text-link" href={href} {...(external ? { rel: "noopener noreferrer" } : {})} {...props}>
      {children}
    </a>
  );
}

const components: MDXComponents = { a: Anchor };

export function useMDXComponents(): MDXComponents {
  return components;
}
