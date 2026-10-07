"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";

import { CHALLENGE_TYPES, GROUP_LIMITS, JOIN_POLICIES, type ShareLevel } from "../constants";
import { idleGroupFormState, type GroupField } from "../form-state";
import { createGroupAction } from "../server/actions";
import { Checkbox, ErrorSummary, Select, ShareLevelChoice, SubmitButton, TextArea, useGroupErrors } from "./form-parts";

const steps = ["basics", "challenge", "members", "covenant", "review"] as const;
type Step = (typeof steps)[number];

const stepOf: Record<GroupField, Step> = {
  name: "basics",
  description: "basics",
  challengeType: "challenge",
  customDays: "challenge",
  startDate: "challenge",
  timezone: "challenge",
  maxMembers: "members",
  joinPolicy: "members",
  covenant: "covenant",
  minShareLevel: "covenant",
  hidingAllowed: "covenant",
  myShareLevel: "covenant",
  shareLevel: "covenant",
  leaderboardHidden: "covenant",
  expiresInDays: "review",
  maxUses: "review",
  accept: "review",
  covenantSeen: "review",
  code: "review",
  confirmName: "review",
};

const order: GroupField[] = [
  "name",
  "description",
  "challengeType",
  "customDays",
  "startDate",
  "timezone",
  "maxMembers",
  "joinPolicy",
  "covenant",
  "minShareLevel",
  "hidingAllowed",
  "myShareLevel",
];

const noopSubscribe = () => () => {};

/**
 * "Start a group" (CLAUDE.md §7.4): one form in five short steps. Without
 * JavaScript every step shows at once and the form still works. With it,
 * CSS shows only the first step until the wizard takes over, so the page
 * doesn't jump when it does. The server
 * checks everything; if something needs fixing, the wizard opens that step.
 */
export function CreateGroupWizard({
  timezones,
  defaultTimezone,
  today,
}: {
  timezones: string[];
  defaultTimezone: string;
  today: string;
}) {
  const t = useTranslations("groups");
  const [state, action] = useActionState(createGroupAction, idleGroupFormState);
  const err = useGroupErrors(state);
  const enhanced = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const [step, setStep] = useState<Step>("basics");
  const [challengeType, setChallengeType] = useState<string>("40");
  const [minLevel, setMinLevel] = useState<ShareLevel>("checkin_only");
  const [summary, setSummary] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);
  const headingRefs = useRef<Partial<Record<Step, HTMLHeadingElement | null>>>({});
  // Focus follows Next and Back; after a server error the error summary keeps it.
  const [focusHeading, setFocusHeading] = useState(false);

  // After a server error, open the step of the first field that needs fixing.
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    const first = order.find((f) => state.fieldErrors?.[f]);
    if (first) setStep(stepOf[first]);
    setFocusHeading(false);
  }

  useEffect(() => {
    if (focusHeading) headingRefs.current[step]?.focus();
  }, [step, focusHeading]);

  const index = steps.indexOf(step);
  function goTo(next: Step) {
    if (next === "review" && formRef.current) {
      const data = new FormData(formRef.current);
      setSummary(Object.fromEntries([...data.entries()].map(([k, v]) => [k, String(v)])));
    }
    setFocusHeading(true);
    setStep(next);
  }

  const heading = (s: Step) => (
    <h2
      className="group-step__title"
      tabIndex={-1}
      ref={(el) => {
        headingRefs.current[s] = el;
      }}
    >
      {t(`create.steps.${s}`)}
    </h2>
  );
  const shown = (s: Step) => !enhanced || step === s;
  const challengeLabel = (v: string) => t(`challengeTypes.${v as (typeof CHALLENGE_TYPES)[number]}`);

  return (
    <form
      ref={formRef}
      action={action}
      className="profile-form group-wizard"
      data-enhanced={enhanced ? "" : undefined}
      noValidate
    >
      <ErrorSummary state={state} order={order} id="create" />
      {/* Rendered on the server too (hidden by CSS without scripting), so the
          first paint already looks like step 1 and nothing moves (CLS). */}
      <p className="auth-step group-wizard__progress" aria-live="polite">
        {t("create.progress", { current: index + 1, total: steps.length })}
      </p>

      <fieldset className="profile-section group-step" hidden={!shown("basics")}>
        {heading("basics")}
        <TextField
          id="create-name"
          name="name"
          label={t("fields.name")}
          hint={t("fields.nameHint", { min: GROUP_LIMITS.nameMin, max: GROUP_LIMITS.nameMax })}
          maxLength={GROUP_LIMITS.nameMax}
          autoComplete="off"
          required
          error={err("name")}
        />
        <TextArea
          id="create-description"
          name="description"
          label={t("fields.description")}
          hint={t("fields.descriptionHint", { max: GROUP_LIMITS.descriptionMax })}
          maxLength={GROUP_LIMITS.descriptionMax}
          defaultValue=""
          rows={3}
          error={err("description")}
        />
        <p className="text-muted">{t("create.pictureLater")}</p>
      </fieldset>

      <fieldset className="profile-section group-step group-step--later" hidden={!shown("challenge")}>
        {heading("challenge")}
        <Select
          id="create-challengeType"
          name="challengeType"
          label={t("fields.challengeType")}
          options={CHALLENGE_TYPES.map((v) => ({ value: v, label: challengeLabel(v) }))}
          defaultValue="40"
          error={err("challengeType")}
          onChange={setChallengeType}
        />
        {!enhanced || challengeType === "custom" ? (
          <TextField
            id="create-customDays"
            name="customDays"
            type="number"
            inputMode="numeric"
            min={GROUP_LIMITS.customDaysMin}
            max={GROUP_LIMITS.customDaysMax}
            label={t("fields.customDays")}
            hint={t("fields.customDaysHint", { min: GROUP_LIMITS.customDaysMin, max: GROUP_LIMITS.customDaysMax })}
            defaultValue="21"
            error={err("customDays")}
          />
        ) : null}
        <TextField
          id="create-startDate"
          name="startDate"
          type="date"
          label={t("fields.startDate")}
          hint={t("fields.startDateHint")}
          defaultValue={today}
          required
          error={err("startDate")}
        />
        <Select
          id="create-timezone"
          name="timezone"
          label={t("fields.timezone")}
          hint={t("fields.timezoneHint")}
          options={timezones.map((z) => ({ value: z, label: z.replaceAll("_", " ") }))}
          defaultValue={defaultTimezone}
          error={err("timezone")}
        />
      </fieldset>

      <fieldset className="profile-section group-step group-step--later" hidden={!shown("members")}>
        {heading("members")}
        <TextField
          id="create-maxMembers"
          name="maxMembers"
          type="number"
          inputMode="numeric"
          min={GROUP_LIMITS.membersMin}
          max={GROUP_LIMITS.membersMax}
          label={t("fields.maxMembers")}
          hint={t("fields.maxMembersHint", { min: GROUP_LIMITS.membersMin, max: GROUP_LIMITS.membersMax })}
          defaultValue={String(GROUP_LIMITS.membersDefault)}
          error={err("maxMembers")}
        />
        <fieldset className="group-choice" id="create-joinPolicy">
          <legend className="ui-label">{t("fields.joinPolicy")}</legend>
          {JOIN_POLICIES.map((policy) => (
            <div key={policy} className="group-choice__option">
              <input
                type="radio"
                id={`create-joinPolicy-${policy}`}
                name="joinPolicy"
                value={policy}
                defaultChecked={policy === "invite_only"}
                aria-describedby={`create-joinPolicy-${policy}-desc`}
              />
              <label htmlFor={`create-joinPolicy-${policy}`}>
                <span className="group-choice__label">{t(`joinPolicies.${policy}.label`)}</span>
                <span className="group-choice__desc" id={`create-joinPolicy-${policy}-desc`}>
                  {t(`joinPolicies.${policy}.description`)}
                </span>
              </label>
            </div>
          ))}
        </fieldset>
      </fieldset>

      <fieldset className="profile-section group-step group-step--later" hidden={!shown("covenant")}>
        {heading("covenant")}
        <TextArea
          id="create-covenant"
          name="covenant"
          label={t("fields.covenant")}
          hint={t("fields.covenantHint", {
            min: GROUP_LIMITS.covenantMin,
            max: GROUP_LIMITS.covenantMax.toLocaleString("en"),
          })}
          maxLength={GROUP_LIMITS.covenantMax}
          defaultValue={t("create.defaultCovenant")}
          rows={5}
          error={err("covenant")}
        />
        <ShareLevelChoice
          id="create-minShareLevel"
          name="minShareLevel"
          legend={t("fields.minShareLevel")}
          hint={t("fields.minShareLevelHint")}
          defaultValue="checkin_only"
          error={err("minShareLevel")}
          onChange={setMinLevel}
        />
        <Checkbox
          id="create-hidingAllowed"
          name="hidingAllowed"
          label={t("fields.hidingAllowed")}
          defaultChecked
          error={err("hidingAllowed")}
        />
        <ShareLevelChoice
          key={minLevel}
          id="create-myShareLevel"
          name="myShareLevel"
          legend={t("fields.myShareLevel")}
          min={minLevel}
          defaultValue={minLevel}
          error={err("myShareLevel")}
        />
      </fieldset>

      <section
        className="profile-section group-step group-step--later"
        hidden={!shown("review")}
        aria-label={t("create.steps.review")}
      >
        {heading("review")}
        {enhanced ? (
          <dl className="group-facts">
            <div>
              <dt>{t("fields.name")}</dt>
              <dd>{summary.name}</dd>
            </div>
            <div>
              <dt>{t("fields.challengeType")}</dt>
              <dd>
                {summary.challengeType === "custom"
                  ? t("invites.days", { count: Number(summary.customDays) || 0 })
                  : summary.challengeType
                    ? challengeLabel(summary.challengeType)
                    : null}
              </dd>
            </div>
            <div>
              <dt>{t("fields.startDate")}</dt>
              <dd>{summary.startDate}</dd>
            </div>
            <div>
              <dt>{t("fields.minShareLevel")}</dt>
              <dd>{summary.minShareLevel ? t(`shareLevels.${summary.minShareLevel as ShareLevel}.label`) : null}</dd>
            </div>
          </dl>
        ) : null}
        <p className="text-muted">{t("create.reviewLede")}</p>
      </section>

      <div className="profile-form__actions">
        {enhanced && index > 0 ? (
          <Button type="button" variant="ghost" onClick={() => goTo(steps[index - 1]!)}>
            {t("create.back")}
          </Button>
        ) : null}
        {enhanced && step !== "review" ? (
          <Button type="button" onClick={() => goTo(steps[index + 1]!)}>
            {t("create.next")}
          </Button>
        ) : (
          <SubmitButton label={t("create.submit")} pendingLabel={t("create.creating")} />
        )}
      </div>
    </form>
  );
}
