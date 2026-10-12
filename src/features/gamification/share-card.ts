import { isDiscreet } from "@/lib/discretion";

import type { LevelOverview } from "./server/queries";

type Translate = (key: "levelAndEra" | "footer", values?: Record<string, string | number>) => string;
type CardLevel = Pick<LevelOverview, "level" | "label" | "era" | "reference">;

/**
 * Every line of text on the share card, in one place so discretion.test.ts
 * can check it (§2.3): name, era, verse reference and the app's name only.
 */
export function shareCardText(level: CardLevel, t: Translate) {
  return {
    levelAndEra: t("levelAndEra", { level: level.level, era: level.era }),
    label: level.label,
    reference: level.reference,
    footer: t("footer"),
  };
}

/**
 * Whether a level can go on a share card: above Level 0, and nothing on the
 * card gives the topic away. A few level names do (for example "Temptation
 * Dodger", levels 61–66), so those levels get no share card (§15: the more
 * private option).
 */
export function canShareLevel(level: Pick<CardLevel, "level" | "label" | "era" | "reference">): boolean {
  return level.level > 0 && [level.label, level.era, level.reference].every(isDiscreet);
}
