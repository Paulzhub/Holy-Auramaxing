"use client";

import { BicepsFlexed, Bird, Flame, HandHeart, Heart, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import type { PreviewState } from "./preview";
import { Spinner } from "./spinner";

export const reactionKinds = ["pray", "heart", "fire", "strong", "dove"] as const;
export type ReactionKind = (typeof reactionKinds)[number];

const icons: Record<ReactionKind, LucideIcon> = {
  pray: HandHeart,
  heart: Heart,
  fire: Flame,
  strong: BicepsFlexed,
  dove: Bird,
};

export interface ReactionState {
  kind: ReactionKind;
  count: number;
  mine: boolean;
}

export interface ReactionBarProps {
  reactions: ReactionState[];
  onToggle?: (kind: ReactionKind) => void;
  disabled?: boolean;
  /** The reaction currently being saved. */
  pending?: ReactionKind;
  preview?: { kind: ReactionKind; state: PreviewState };
}

export function ReactionBar({ reactions, onToggle, disabled = false, pending, preview }: ReactionBarProps) {
  const t = useTranslations("ui.reactions");

  return (
    <ul className="ui-reactions" aria-label={t("label")}>
      {reactions.map(({ kind, count, mine }) => {
        const Icon = icons[kind];
        const busy = pending === kind;
        const inactive = disabled || busy;
        return (
          <li key={kind}>
            <button
              type="button"
              className="ui-reaction"
              aria-pressed={mine}
              aria-disabled={inactive || undefined}
              aria-busy={busy || undefined}
              data-preview={preview?.kind === kind ? preview.state : undefined}
              onClick={() => {
                if (!inactive) onToggle?.(kind);
              }}
            >
              {busy ? <Spinner /> : <Icon aria-hidden="true" />}
              <span aria-hidden="true">{count}</span>
              <span className="visually-hidden">{t("buttonLabel", { reaction: t(`kinds.${kind}`), count })}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
