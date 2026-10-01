import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import en from "../../messages/en.json";

import { locales } from "./routing";

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): Record<string, string> {
  return Object.entries(tree).reduce<Record<string, string>>((acc, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") acc[path] = value;
    else Object.assign(acc, flatten(value, path));
    return acc;
  }, {});
}

const dir = join(process.cwd(), "messages");
const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
const english = flatten(en as Tree);

describe("message files", () => {
  it("exist for every configured locale", () => {
    expect(files.map((f) => f.replace(".json", "")).sort()).toEqual([...locales].sort());
  });

  it.each(files)("%s has exactly the English keys and no empty strings", (file) => {
    const messages = flatten(JSON.parse(readFileSync(join(dir, file), "utf8")) as Tree);
    expect(Object.keys(messages).sort()).toEqual(Object.keys(english).sort());
    for (const [key, value] of Object.entries(messages)) expect(value.trim(), key).not.toBe("");
  });

  it("every English message parses and formats", () => {
    const t = createTranslator({ locale: "en", messages: en });
    const sample = {
      page: "Home",
      app: "Aura",
      date: "1 September",
      status: "x",
      reaction: "Love",
      count: 2,
      tab: "Level",
      value: 3,
      max: 10,
      reason: "x",
    };
    const errors: string[] = [];
    for (const key of Object.keys(english)) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic keys under test
        (t as any)(key, sample);
      } catch (error) {
        errors.push(`${key}: ${(error as Error).message}`);
      }
    }
    expect(errors).toEqual([]);
  });

  it("keeps the browser tab name discreet", () => {
    // CLAUDE.md §2.3: tab titles never reveal the topic.
    const tabName = (en.app.tabName + en.meta.titleTemplate).toLowerCase();
    for (const word of ["porn", "fap", "lust", "relapse", "addiction", "sex", "xxx"]) {
      expect(tabName).not.toContain(word);
    }
  });
});
