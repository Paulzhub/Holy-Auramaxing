import type { LevelOverview } from "./server/queries";

/** What the check-in just did to the level, for the page after it. */
export type LevelChange =
  { kind: "up"; label: string; era: string; newEra: boolean } | { kind: "down"; label: string } | { kind: "same" };

export function levelChangeAfterSave(o: LevelOverview): LevelChange {
  if (o.levelBeforeSave === null || o.levelBeforeSave === o.level) return { kind: "same" };
  if (o.level > o.levelBeforeSave) {
    return { kind: "up", label: o.label, era: o.era, newEra: o.beforeEra !== null && o.beforeEra !== o.era };
  }
  return { kind: "down", label: o.label };
}
