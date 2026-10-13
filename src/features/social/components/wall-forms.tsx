"use client";

import { CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useId, useRef } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

import { POST_KINDS, SOCIAL_LIMITS, type PostKind } from "../constants";
import { idleSocialFormState, type SocialFormState } from "../form-state";
import { createCommentAction, createPostAction, editCommentAction, editPostAction } from "../server/actions";

/**
 * The wall's text forms (CLAUDE.md §7.7): a new post, a comment, and editing
 * either. Plain text only. On an error the typed words come back, the error
 * is announced and focus moves to it; on success the form clears and a
 * polite status says so. Messages are under "social".
 */

type Action = (prev: SocialFormState, formData: FormData) => Promise<SocialFormState>;

function Submit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} loadingLabel={pendingLabel}>
      {label}
    </Button>
  );
}

function TextForm({
  action,
  idBase,
  label,
  hint,
  max,
  initial,
  submit,
  savedMessage,
  rows,
  kinds,
  defaultKind,
  onSaved,
}: {
  action: Action;
  idBase: string;
  label: string;
  hint: string;
  max: number;
  initial: string;
  submit: string;
  savedMessage: string;
  rows: number;
  kinds?: readonly PostKind[];
  defaultKind?: PostKind;
  onSaved?: () => void;
}) {
  const t = useTranslations("social");
  const [state, formAction] = useActionState(action, idleSocialFormState);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const id = `${idBase}-body`;
  const error = state.status === "error" && state.error ? t(`errors.${state.error}`) : undefined;

  useEffect(() => {
    if (state.status === "error") errorRef.current?.focus();
    if (state.status === "saved") onSaved?.();
    // onSaved is stable enough for a one-shot callback; run on each new state only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // After a save the form resets to empty (or to the new text when editing);
  // after an error, to what was typed.
  const body = state.status === "error" ? (state.body ?? initial) : initial;
  const kind = (
    state.status === "error" && (POST_KINDS as readonly string[]).includes(state.kind ?? "") ? state.kind : defaultKind
  ) as PostKind | undefined;

  return (
    <form action={formAction} className="wall-form" noValidate>
      {error ? (
        <p ref={errorRef} className="ui-error-text wall-form__error" role="alert" tabIndex={-1} id={`${idBase}-error`}>
          <CircleAlert aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}
      {kinds ? (
        <fieldset className="wall-form__kinds">
          <legend className="ui-label">{t("form.kind")}</legend>
          <div className="wall-form__kind-list">
            {kinds.map((k) => (
              <label key={k} className="wall-kind-choice">
                <input type="radio" name="kind" value={k} defaultChecked={k === (kind ?? kinds[0])} />
                <span>{t(`kinds.${k}`)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <div className="ui-field">
        <label className="ui-label" htmlFor={id}>
          {label}
        </label>
        <p className="ui-hint" id={`${id}-hint`}>
          {hint}
        </p>
        <textarea
          key={state.savedAt ?? "draft"}
          id={id}
          name="body"
          className="ui-input wall-form__text"
          rows={rows}
          maxLength={max}
          required
          defaultValue={body}
          aria-invalid={error ? true : undefined}
          aria-describedby={[`${id}-hint`, error ? `${idBase}-error` : null].filter(Boolean).join(" ")}
        />
      </div>
      <div className="wall-form__actions">
        <Submit label={submit} pendingLabel={t("form.posting")} />
      </div>
      <p className="visually-hidden" role="status">
        {state.status === "saved" ? savedMessage : ""}
      </p>
    </form>
  );
}

/** A new post. Announcements only for owners and admins (the database checks too). */
export function PostComposer({ groupId, canAnnounce }: { groupId: string; canAnnounce: boolean }) {
  const t = useTranslations("social");
  const kinds = POST_KINDS.filter((k) => canAnnounce || k !== "announcement");
  return (
    <TextForm
      action={createPostAction.bind(null, groupId)}
      idBase="new-post"
      label={t("form.body")}
      hint={t("form.bodyHint", { max: SOCIAL_LIMITS.postMax })}
      max={SOCIAL_LIMITS.postMax}
      initial=""
      submit={t("form.post")}
      savedMessage={t("form.posted")}
      rows={4}
      kinds={kinds}
      defaultKind="encouragement"
    />
  );
}

export function CommentComposer({ postId }: { postId: string }) {
  const t = useTranslations("social");
  return (
    <TextForm
      action={createCommentAction.bind(null, postId)}
      idBase={`comment-${postId}`}
      label={t("form.comment")}
      hint={t("form.commentHint", { max: SOCIAL_LIMITS.commentMax })}
      max={SOCIAL_LIMITS.commentMax}
      initial=""
      submit={t("form.sendComment")}
      savedMessage={t("form.commented")}
      rows={3}
    />
  );
}

/** Editing my post or comment, inside a <details> the server renders around it. */
export function EditTextForm({ target, id, body }: { target: "post" | "comment"; id: string; body: string }) {
  const t = useTranslations("social");
  const uid = useId();
  const ref = useRef<HTMLDivElement>(null);
  const max = target === "post" ? SOCIAL_LIMITS.postMax : SOCIAL_LIMITS.commentMax;
  return (
    <div ref={ref}>
      <TextForm
        action={(target === "post" ? editPostAction : editCommentAction).bind(null, id)}
        idBase={`edit-${target}-${id}-${uid.replace(/[^a-zA-Z0-9]/g, "")}`}
        label={t("form.editTitle")}
        hint={target === "post" ? t("form.bodyHint", { max }) : t("form.commentHint", { max })}
        max={max}
        initial={body}
        submit={t("form.save")}
        savedMessage={t("form.saved")}
        rows={target === "post" ? 4 : 3}
        onSaved={() => {
          // Close the surrounding <details> and give focus back to its summary.
          const details = ref.current?.closest("details");
          if (details) {
            details.open = false;
            details.querySelector("summary")?.focus();
          }
        }}
      />
    </div>
  );
}
