"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { TextField } from "@/components/ui/text-field";

import type { ShareLevel } from "../constants";
import { idleGroupFormState } from "../form-state";
import { enterInviteCodeAction, joinGroupAction } from "../server/actions";
import { Checkbox, ErrorSummary, ShareLevelChoice, SubmitButton, useGroupErrors } from "./form-parts";

/**
 * Joining a group: the person picks what they share (at least the
 * covenant's minimum) and accepts the covenant (CLAUDE.md §7.4, D-027).
 * `covenantSeen` lets the database refuse if the covenant changed while
 * they were reading.
 */
export function JoinForm({
  minShareLevel,
  hidingAllowed,
  covenantSeen,
  needsApproval,
}: {
  minShareLevel: ShareLevel;
  hidingAllowed: boolean;
  covenantSeen: string;
  needsApproval: boolean;
}) {
  const t = useTranslations("groups");
  const [state, action] = useActionState(joinGroupAction, idleGroupFormState);
  const err = useGroupErrors(state);
  return (
    <form action={action} className="auth-form" noValidate>
      <ErrorSummary state={state} order={["shareLevel", "leaderboardHidden", "accept", "covenantSeen"]} id="join" />
      <input type="hidden" name="covenantSeen" value={covenantSeen} />
      <ShareLevelChoice
        id="join-shareLevel"
        name="shareLevel"
        legend={t("fields.shareLevel")}
        min={minShareLevel}
        defaultValue={minShareLevel}
        error={err("shareLevel")}
      />
      {hidingAllowed ? (
        <Checkbox id="join-leaderboardHidden" name="leaderboardHidden" label={t("fields.leaderboardHidden")} />
      ) : null}
      <Checkbox id="join-accept" name="accept" label={t("join.accept")} required error={err("accept")} />
      {needsApproval ? <p className="text-muted">{t("join.approvalNote")}</p> : null}
      <div>
        <SubmitButton
          label={needsApproval ? t("join.submitRequest") : t("join.submit")}
          pendingLabel={t("join.joining")}
        />
      </div>
    </form>
  );
}

/** "Join with a code": the short code someone shared. */
export function InviteCodeForm() {
  const t = useTranslations("groups");
  const [state, action] = useActionState(enterInviteCodeAction, idleGroupFormState);
  const err = useGroupErrors(state);
  return (
    <form action={action} className="auth-form" noValidate>
      <TextField
        id="join-code"
        name="code"
        label={t("join.codeLabel")}
        hint={t("join.codeHint")}
        autoComplete="off"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        maxLength={20}
        required
        defaultValue={state.values?.code}
        error={err("code")}
      />
      <div>
        <SubmitButton label={t("join.codeSubmit")} pendingLabel={t("join.joining")} />
      </div>
    </form>
  );
}
