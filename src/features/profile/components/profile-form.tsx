"use client";

import { CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { TextField } from "@/components/ui/text-field";
import { Link } from "@/i18n/navigation";

import {
  BIO_MAX,
  DISPLAY_NAME_MAX,
  type ShareLevel,
  shareLevels,
  TESTIMONY_MAX,
  VERSE_MAX,
  type Visibility,
  visibilities,
} from "../limits";
import type { ProfileField, ProfileFormState } from "../profile-schema";
import { saveProfileAction } from "../server/profile-actions";

export interface ProfileFormValues {
  displayName: string;
  handle: string;
  bio: string;
  testimony: string;
  favouriteVerse: string;
  profileVisibility: Visibility;
  bioVisibility: Visibility;
  testimonyVisibility: Visibility;
  verseVisibility: Visibility;
  showInLeaderboards: boolean;
  defaultShareLevel: ShareLevel;
}

const initial: ProfileFormState = { status: "idle" };

/** Field order, for the error summary. */
const fieldOrder: ProfileField[] = [
  "displayName",
  "handle",
  "bio",
  "bioVisibility",
  "favouriteVerse",
  "verseVisibility",
  "testimony",
  "testimonyVisibility",
  "profileVisibility",
  "showInLeaderboards",
  "defaultShareLevel",
];

function ErrorSummary({ state }: { state: ProfileFormState }) {
  const t = useTranslations("profile");
  const ref = useRef<HTMLDivElement>(null);
  const entries = fieldOrder.flatMap((f) => (state.fieldErrors?.[f] ? [[f, state.fieldErrors[f]!] as const] : []));
  const hasErrors = state.status === "error" && (entries.length > 0 || Boolean(state.formError));

  useEffect(() => {
    if (hasErrors) ref.current?.focus();
  }, [state, hasErrors]);

  if (!hasErrors) return null;
  return (
    <div ref={ref} className="auth-error-summary" role="alert" tabIndex={-1} aria-labelledby="profile-error-title">
      <h2 id="profile-error-title" className="auth-error-summary__title">
        <CircleAlert aria-hidden="true" />
        {t("editor.errorSummaryTitle")}
      </h2>
      <ul>
        {state.formError ? <li>{t(`errors.${state.formError}`)}</li> : null}
        {entries.map(([field, key]) => (
          <li key={field}>
            <a href={`#${field}`}>{t(`errors.${key}`)}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p className="ui-error-text" id={id}>
      <CircleAlert aria-hidden="true" />
      <span>{message}</span>
    </p>
  );
}

function TextArea({
  id,
  label,
  hint,
  error,
  maxLength,
  defaultValue,
  rows,
}: {
  id: ProfileField;
  label: string;
  hint: string;
  error?: string;
  maxLength: number;
  defaultValue: string;
  rows: number;
}) {
  const describedBy = [`${id}-hint`, error ? `${id}-error` : null].filter(Boolean).join(" ");
  return (
    <div className="ui-field">
      <label className="ui-label" htmlFor={id}>
        {label}
      </label>
      <p className="ui-hint" id={`${id}-hint`}>
        {hint}
      </p>
      <textarea
        id={id}
        name={id}
        className="ui-input onboarding-textarea"
        rows={rows}
        maxLength={maxLength}
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      />
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

function Choice<T extends string>({
  id,
  label,
  hint,
  options,
  labels,
  defaultValue,
  error,
}: {
  id: ProfileField;
  label: string;
  hint?: string;
  options: readonly T[];
  labels: (value: T) => string;
  defaultValue: T;
  error?: string;
}) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="ui-field">
      <label className="ui-label" htmlFor={id}>
        {label}
      </label>
      {hint ? (
        <p className="ui-hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
      <select
        id={id}
        name={id}
        className="ui-input"
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      >
        {options.map((value) => (
          <option key={value} value={value}>
            {labels(value)}
          </option>
        ))}
      </select>
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

function Section({ title, lede, children }: { title: string; lede?: string; children: ReactNode }) {
  return (
    <fieldset className="profile-section">
      <legend className="profile-section__title">{title}</legend>
      {lede ? <p className="text-muted">{lede}</p> : null}
      {children}
    </fieldset>
  );
}

function SaveButton() {
  const t = useTranslations("profile.editor");
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" loading={pending} loadingLabel={t("saving")}>
      {t("save")}
    </Button>
  );
}

/** The profile editor (CLAUDE.md §7.3): every field with its own privacy control. */
export function ProfileForm({ values }: { values: ProfileFormValues }) {
  const t = useTranslations("profile");
  const [state, action] = useActionState(saveProfileAction, initial);
  const err = (field: ProfileField) => {
    const key = state.fieldErrors?.[field];
    return key ? t(`errors.${key}`) : undefined;
  };
  const visibilityLabel = (v: Visibility) => t(`visibilityOption.${v}`);

  return (
    <form action={action} className="profile-form" noValidate>
      <ErrorSummary state={state} />

      <Section title={t("editor.detailsTitle")}>
        <TextField
          id="displayName"
          name="displayName"
          label={t("editor.nameLabel")}
          hint={t("editor.nameHint", { max: DISPLAY_NAME_MAX })}
          defaultValue={values.displayName}
          autoComplete="nickname"
          maxLength={DISPLAY_NAME_MAX}
          error={err("displayName")}
        />
        <TextField
          id="handle"
          name="handle"
          label={t("editor.handleLabel")}
          hint={t("editor.handleHint")}
          defaultValue={values.handle}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={21}
          required
          error={err("handle")}
        />
        <div className="profile-pair">
          <TextArea
            id="bio"
            label={t("editor.bioLabel")}
            hint={t("editor.bioHint", { max: BIO_MAX })}
            maxLength={BIO_MAX}
            defaultValue={values.bio}
            rows={3}
            error={err("bio")}
          />
          <Choice
            id="bioVisibility"
            label={t("editor.whoSeesBio")}
            options={visibilities}
            labels={visibilityLabel}
            defaultValue={values.bioVisibility}
            error={err("bioVisibility")}
          />
        </div>
        <div className="profile-pair">
          <TextField
            id="favouriteVerse"
            name="favouriteVerse"
            label={t("editor.verseLabel")}
            hint={t("editor.verseHint", { max: VERSE_MAX })}
            defaultValue={values.favouriteVerse}
            maxLength={VERSE_MAX}
            error={err("favouriteVerse")}
          />
          <Choice
            id="verseVisibility"
            label={t("editor.whoSeesVerse")}
            options={visibilities}
            labels={visibilityLabel}
            defaultValue={values.verseVisibility}
            error={err("verseVisibility")}
          />
        </div>
        <div className="profile-pair">
          <TextArea
            id="testimony"
            label={t("editor.testimonyLabel")}
            hint={t("editor.testimonyHint", { max: TESTIMONY_MAX.toLocaleString("en") })}
            maxLength={TESTIMONY_MAX}
            defaultValue={values.testimony}
            rows={8}
            error={err("testimony")}
          />
          <Choice
            id="testimonyVisibility"
            label={t("editor.whoSeesTestimony")}
            options={visibilities}
            labels={visibilityLabel}
            defaultValue={values.testimonyVisibility}
            error={err("testimonyVisibility")}
          />
        </div>
      </Section>

      <Section title={t("editor.privacyTitle")} lede={t("editor.privacyLede")}>
        <Choice
          id="profileVisibility"
          label={t("editor.profileVisibilityLabel")}
          hint={t("editor.profileVisibilityHint")}
          options={visibilities}
          labels={visibilityLabel}
          defaultValue={values.profileVisibility}
          error={err("profileVisibility")}
        />
        <div>
          <div className="auth-check">
            <input
              type="checkbox"
              id="showInLeaderboards"
              name="showInLeaderboards"
              defaultChecked={values.showInLeaderboards}
              aria-describedby="showInLeaderboards-hint"
            />
            <label htmlFor="showInLeaderboards">{t("editor.leaderboardLabel")}</label>
          </div>
          <p className="ui-hint auth-check__hint" id="showInLeaderboards-hint">
            {t("editor.leaderboardHint")}
          </p>
        </div>
        <Choice
          id="defaultShareLevel"
          label={t("editor.shareLevelLabel")}
          hint={t("editor.shareLevelHint")}
          options={shareLevels}
          labels={(v) => t(`shareLevels.${v}`)}
          defaultValue={values.defaultShareLevel}
          error={err("defaultShareLevel")}
        />
      </Section>

      <div className="profile-form__actions">
        <SaveButton />
        <Link href="/me" className={buttonVariants({ variant: "ghost", size: "lg" })}>
          {t("editor.cancel")}
        </Link>
      </div>
    </form>
  );
}
