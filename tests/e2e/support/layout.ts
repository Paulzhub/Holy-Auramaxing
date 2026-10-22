import type { Page } from "@playwright/test";

// Layout checks shared by the accessibility review specs (reviews 1 and 2).

/** Elements wider than the viewport, outside any sideways-scrolling box. */
export async function overflowing(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const out: string[] = [];
    if (document.documentElement.scrollWidth > vw + 1)
      out.push(`page scrolls sideways (${document.documentElement.scrollWidth}px)`);
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0 || el.closest(".visually-hidden, [aria-hidden=true]")) continue;
      // A closed <details> menu's panel isn't shown (Chrome still gives it a box).
      if (el.closest("details:not([open]) > :not(summary)")) continue;
      if (getComputedStyle(el).visibility === "hidden") continue;
      let p = el.parentElement;
      let inScroller = false;
      while (p) {
        if (/(auto|scroll)/.test(getComputedStyle(p).overflowX)) inScroller = true;
        p = p.parentElement;
      }
      if (!inScroller && (rect.right > vw + 1 || rect.left < -1))
        out.push(
          `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} [${Math.round(rect.left)}, ${Math.round(rect.right)}]`,
        );
    }
    return out.slice(0, 10);
  });
}

/** WCAG 1.4.12's text spacing, added the way the CSP allows (a constructed stylesheet). */
export async function widenTextSpacing(page: Page) {
  await page.evaluate(() => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(
      "* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }",
    );
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  });
}

/** Text cut off by its own box (overflow hidden or clipped): content lost to the reader. */
export async function clippedText(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("main *"))) {
      if (el.closest("[aria-hidden=true], .visually-hidden, details:not([open]) > :not(summary)")) continue;
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || !el.textContent?.trim()) continue;
      const x = /(hidden|clip)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1;
      const y = /(hidden|clip)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1;
      if (x || y)
        out.push(
          `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} "${el.textContent.trim().slice(0, 30)}"`,
        );
    }
    return out.slice(0, 10);
  });
}
