"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";

import { SquareImageEditor } from "@/components/image-picker/square-image-editor";
import { TextField } from "@/components/ui/text-field";

import {
  CHALLENGE_TYPES,
  GROUP_LIMITS,
  JOIN_POLICIES,
  type ChallengeType,
  type JoinPolicy,
  type ShareLevel,
} from "../constants";
import { idleGroupFormState } from "../form-state";
import {
  removeGroupPictureAction,
  saveCovenantAction,
  saveGroupChallengeAction,
  saveGroupDetailsAction,
  saveMembershipAction,
  uploadGroupPictureAction,
} from "../server/actions";
import {
  Checkbox,
  ErrorSummary,
  SavedStatus,
  Select,
  ShareLevelChoice,
  SubmitButton,
  TextArea,
  useGroupErrors,
} from "./form-parts";

/** Group picture: the shared square image picker (D-036), for owners and admins. */
export function GroupPictureEditor({
  groupId,
  name,
  src,
  status,
  hasPending,
}: {
  groupId: string;
  name: string;
  src?: string;
  status: "none" | "pending_review" | "ready" | "rejected";
  hasPending: boolean;
}) {
  return (
    <SquareImageEditor
      messages="groups.picture"
      field="picture"
      shape="square"
      name={name}
      src={src}
      status={status}
      hasPending={hasPending}
      uploadAction={uploadGroupPictureAction.bind(null, groupId)}
      removeAction={removeGroupPictureAction.bind(null, groupId)}
    />
  );
}

export function GroupDetailsForm({
  groupId,
  name,
  description,
}: {
  groupId: string;
  name: string;
  description: string;
}) {
  const t = useTranslations("groups");
  const [state, action] = useActionState(saveGroupDetailsAction.bind(null, groupId), idleGroupFormState);
  const err = useGroupErrors(state);
  return (
    <form action={action} className="profile-section" noValidate aria-labelledby="details-title">
      <h2 id="details-title" className="profile-section__title">
        {t("settings.detailsTitle")}
      </h2>
      <ErrorSummary state={state} order={["name", "description"]} id="details" />
      <TextField
        id="details-name"
        name="name"
        label={t("fields.name")}
        hint={t("fields.nameHint", { min: GROUP_LIMITS.nameMin, max: GROUP_LIMITS.nameMax })}
        maxLength={GROUP_LIMITS.nameMax}
        defaultValue={name}
        autoComplete="off"
        required
        error={err("name")}
      />
      <TextArea
        id="details-description"
        name="description"
        label={t("fields.description")}
        hint={t("fields.descriptionHint", { max: GROUP_LIMITS.descriptionMax })}
        maxLength={GROUP_LIMITS.descriptionMax}
        defaultValue={description}
        rows={3}
        error={err("description")}
      />
      <div className="profile-form__actions">
        <SubmitButton label={t("settings.save")} pendingLabel={t("settings.saving")} />
        <SavedStatus message={state.status === "saved" ? t("notices.saved") : undefined} />
      </div>
    </form>
  );
}

export function GroupChallengeForm({
  groupId,
  values,
  timezones,
}: {
  groupId: string;
  values: {
    challengeType: ChallengeType;
    challengeDays: number | null;
    startDate: string;
    timezone: string;
    maxMembers: number;
    joinPolicy: JoinPolicy;
  };
  timezones: string[];
}) {
  const t = useTranslations("groups");
  const [state, action] = useActionState(saveGroupChallengeAction.bind(null, groupId), idleGroupFormState);
  const err = useGroupErrors(state);
  const [type, setType] = useState<string>(values.challengeType);
  return (
    <form action={action} className="profile-section" noValidate aria-labelledby="challenge-title">
      <h2 id="challenge-title" className="profile-section__title">
        {t("settings.challengeTitle")}
      </h2>
      <ErrorSummary
        state={state}
        order={["challengeType", "customDays", "startDate", "timezone", "maxMembers", "joinPolicy"]}
        id="challenge"
      />
      <Select
        id="challenge-challengeType"
        name="challengeType"
        label={t("fields.challengeType")}
        options={CHALLENGE_TYPES.map((v) => ({ value: v, label: t(`challengeTypes.${v}`) }))}
        defaultValue={values.challengeType}
        error={err("challengeType")}
        onChange={setType}
      />
      {type === "custom" ? (
        <TextField
          id="challenge-customDays"
          name="customDays"
          type="number"
          inputMode="numeric"
          min={GROUP_LIMITS.customDaysMin}
          max={GROUP_LIMITS.customDaysMax}
          label={t("fields.customDays")}
          hint={t("fields.customDaysHint", { min: GROUP_LIMITS.customDaysMin, max: GROUP_LIMITS.customDaysMax })}
          defaultValue={String(values.challengeDays ?? 21)}
          error={err("customDays")}
        />
      ) : null}
      <TextField
        id="challenge-startDate"
        name="startDate"
        type="date"
        label={t("fields.startDate")}
        hint={t("fields.startDateHint")}
        defaultValue={values.startDate}
        error={err("startDate")}
      />
      <Select
        id="challenge-timezone"
        name="timezone"
        label={t("fields.timezone")}
        hint={t("fields.timezoneHint")}
        options={timezones.map((z) => ({ value: z, label: z.replaceAll("_", " ") }))}
        defaultValue={values.timezone}
        error={err("timezone")}
      />
      <TextField
        id="challenge-maxMembers"
        name="maxMembers"
        type="number"
        inputMode="numeric"
        min={GROUP_LIMITS.membersMin}
        max={GROUP_LIMITS.membersMax}
        label={t("fields.maxMembers")}
        hint={t("fields.maxMembersHint", { min: GROUP_LIMITS.membersMin, max: GROUP_LIMITS.membersMax })}
        defaultValue={String(values.maxMembers)}
        error={err("maxMembers")}
      />
      <Select
        id="challenge-joinPolicy"
        name="joinPolicy"
        label={t("fields.joinPolicy")}
        options={JOIN_POLICIES.map((p) => ({ value: p, label: t(`joinPolicies.${p}.label`) }))}
        defaultValue={values.joinPolicy}
        error={err("joinPolicy")}
      />
      <div className="profile-form__actions">
        <SubmitButton label={t("settings.save")} pendingLabel={t("settings.saving")} />
        <SavedStatus message={state.status === "saved" ? t("notices.saved") : undefined} />
      </div>
    </form>
  );
}

export function CovenantForm({
  groupId,
  values,
}: {
  groupId: string;
  values: { covenant: string; minShareLevel: ShareLevel; hidingAllowed: boolean };
}) {
  const t = useTranslations("groups");
  const [state, action] = useActionState(saveCovenantAction.bind(null, groupId), idleGroupFormState);
  const err = useGroupErrors(state);
  const outcome =
    state.status === "saved"
      ? state.outcome === "proposed"
        ? t("notices.covenantProposed")
        : state.outcome === "applied"
          ? t("notices.covenantApplied")
          : t("notices.covenantUnchanged")
      : undefined;
  return (
    <form action={action} className="profile-section" noValidate aria-labelledby="covenant-title">
      <h2 id="covenant-title" className="profile-section__title">
        {t("settings.covenantTitle")}
      </h2>
      <p className="text-muted">{t("settings.covenantLede")}</p>
      <ErrorSummary state={state} order={["covenant", "minShareLevel", "hidingAllowed"]} id="covenant" />
      <TextArea
        id="covenant-covenant"
        name="covenant"
        label={t("fields.covenant")}
        hint={t("fields.covenantHint", {
          min: GROUP_LIMITS.covenantMin,
          max: GROUP_LIMITS.covenantMax.toLocaleString("en"),
        })}
        maxLength={GROUP_LIMITS.covenantMax}
        defaultValue={values.covenant}
        rows={5}
        error={err("covenant")}
      />
      <ShareLevelChoice
        id="covenant-minShareLevel"
        name="minShareLevel"
        legend={t("fields.minShareLevel")}
        hint={t("fields.minShareLevelHint")}
        defaultValue={values.minShareLevel}
        error={err("minShareLevel")}
      />
      <Checkbox
        id="covenant-hidingAllowed"
        name="hidingAllowed"
        label={t("fields.hidingAllowed")}
        defaultChecked={values.hidingAllowed}
        error={err("hidingAllowed")}
      />
      <div className="profile-form__actions">
        <SubmitButton label={t("settings.covenantSave")} pendingLabel={t("settings.saving")} />
        <SavedStatus message={outcome} />
      </div>
    </form>
  );
}

export function MembershipForm({
  groupId,
  values,
  minShareLevel,
  hidingAllowed,
}: {
  groupId: string;
  values: { shareLevel: ShareLevel; leaderboardHidden: boolean };
  minShareLevel: ShareLevel;
  hidingAllowed: boolean;
}) {
  const t = useTranslations("groups");
  const [state, action] = useActionState(saveMembershipAction.bind(null, groupId), idleGroupFormState);
  const err = useGroupErrors(state);
  return (
    <form action={action} className="profile-section" noValidate aria-labelledby="membership-title">
      <h2 id="membership-title" className="profile-section__title">
        {t("settings.membershipTitle")}
      </h2>
      <p className="text-muted">{t("settings.membershipLede", { level: t(`shareLevels.${minShareLevel}.label`) })}</p>
      <ErrorSummary state={state} order={["shareLevel", "leaderboardHidden"]} id="membership" />
      <ShareLevelChoice
        id="membership-shareLevel"
        name="shareLevel"
        legend={t("fields.shareLevel")}
        min={minShareLevel}
        defaultValue={values.shareLevel}
        error={err("shareLevel")}
      />
      {hidingAllowed ? (
        <Checkbox
          id="membership-leaderboardHidden"
          name="leaderboardHidden"
          label={t("fields.leaderboardHidden")}
          defaultChecked={values.leaderboardHidden}
          error={err("leaderboardHidden")}
        />
      ) : null}
      <div className="profile-form__actions">
        <SubmitButton label={t("settings.save")} pendingLabel={t("settings.saving")} />
        <SavedStatus message={state.status === "saved" ? t("notices.saved") : undefined} />
      </div>
    </form>
  );
}
