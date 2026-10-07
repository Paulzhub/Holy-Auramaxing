"use client";

import { Check, Copy, Download, Share2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";

import { INVITE_LIMITS } from "../constants";
import { idleGroupFormState, type CreatedInvite, type InviteFormState } from "../form-state";
import { createInviteAction, replaceInviteAction, revokeInviteAction } from "../server/actions";
import { ErrorSummary, Select, SubmitButton, useGroupErrors } from "./form-parts";

export interface InviteRow {
  id: string;
  createdAt: string;
  expiresAt: string;
  maxUses: number | null;
  useCount: number;
  state: "active" | "expired" | "revoked" | "used_up";
}

const noopSubscribe = () => () => {};

function CopyButton({ text, label }: { text: string; label: string }) {
  const t = useTranslations("groups.invites");
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 4000);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      {copied ? t("copied") : label}
    </Button>
  );
}

/** The link, code and QR code, shown once after an invite is made. */
function CreatedPanel({ invite }: { invite: CreatedInvite }) {
  const t = useTranslations("groups.invites");
  const format = useFormatter();
  const ref = useRef<HTMLElement>(null);
  const canShare = useSyncExternalStore(
    noopSubscribe,
    () => typeof navigator.share === "function",
    () => false,
  );
  const qrUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(invite.qrSvg)}`;

  // Move focus to the new invite, so it's announced and easy to reach.
  useEffect(() => {
    ref.current?.focus();
  }, [invite]);

  return (
    <section
      ref={ref}
      tabIndex={-1}
      className="profile-section group-invite-created"
      aria-labelledby="invite-created-title"
    >
      <h2 id="invite-created-title" className="profile-section__title">
        {t("createdTitle")}
      </h2>
      <p className="text-muted">{t("createdOnce")}</p>
      <p className="text-muted">
        {t("expiresOn", {
          date: format.dateTime(new Date(invite.expiresAt), { dateStyle: "medium", timeStyle: "short" }),
        })}
      </p>

      <div className="group-invite-created__grid">
        <div
          className="group-qr"
          // The SVG is drawn by our own server (qr.ts) from the link: no user content.
          dangerouslySetInnerHTML={{ __html: invite.qrSvg }}
        />
        <div className="grid gap-4">
          <div className="ui-field">
            <span className="ui-label" id="invite-link-label">
              {t("link")}
            </span>
            <output className="group-secret" aria-labelledby="invite-link-label" data-testid="invite-link">
              {invite.link}
            </output>
            <div className="profile-actions">
              <CopyButton text={invite.link} label={t("copyLink")} />
              {canShare ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => navigator.share({ title: t("shareText"), url: invite.link }).catch(() => undefined)}
                >
                  <Share2 aria-hidden="true" />
                  {t("share")}
                </Button>
              ) : null}
            </div>
          </div>
          <div className="ui-field">
            <span className="ui-label" id="invite-code-label">
              {t("code")}
            </span>
            <output
              className="group-secret group-secret--code"
              aria-labelledby="invite-code-label"
              data-testid="invite-code"
            >
              {invite.code}
            </output>
            <p className="ui-hint">{t("codeHint")}</p>
            <div className="profile-actions">
              <CopyButton text={invite.code} label={t("copyCode")} />
            </div>
          </div>
          <div>
            <a className={buttonVariants({ variant: "secondary", size: "sm" })} href={qrUrl} download="invite-qr.svg">
              <Download aria-hidden="true" />
              {t("downloadQr")}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function ReplaceButton() {
  const t = useTranslations("groups.invites");
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" size="sm" loading={pending} loadingLabel={t("creating")}>
      {t("regenerate")}
    </Button>
  );
}

/**
 * Invites for a group's owner and admins: make one (link, code and QR,
 * shown once), and see, stop or replace the others (CLAUDE.md §7.4).
 */
export function InviteManager({
  groupId,
  invites,
  archived,
}: {
  groupId: string;
  invites: InviteRow[];
  archived: boolean;
}) {
  const t = useTranslations("groups");
  const format = useFormatter();
  const [created, create] = useActionState(
    createInviteAction.bind(null, groupId),
    idleGroupFormState as InviteFormState,
  );
  const [replaced, replace] = useActionState(
    replaceInviteAction.bind(null, groupId),
    idleGroupFormState as InviteFormState,
  );
  const err = useGroupErrors(created);
  // Whichever was made last is the one to show.
  const [latest, setLatest] = useState<CreatedInvite | null>(null);
  const [seen, setSeen] = useState({ created, replaced });
  if (seen.created !== created || seen.replaced !== replaced) {
    setSeen({ created, replaced });
    const fresh = seen.created !== created ? created.invite : replaced.invite;
    if (fresh) setLatest(fresh);
  }
  const date = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "medium" });

  return (
    <div className="stack">
      {latest ? <CreatedPanel invite={latest} /> : null}

      {!archived ? (
        <form action={create} className="profile-section" noValidate aria-labelledby="invite-new-title">
          <h2 id="invite-new-title" className="profile-section__title">
            {t("invites.newTitle")}
          </h2>
          <ErrorSummary state={created} order={["expiresInDays", "maxUses"]} id="invite" />
          <Select
            id="invite-expiresInDays"
            name="expiresInDays"
            label={t("invites.expiresInDays")}
            options={INVITE_LIMITS.expiryChoices.map((d) => ({
              value: String(d),
              label: t("invites.days", { count: d }),
            }))}
            defaultValue={String(INVITE_LIMITS.expiryDefault)}
            error={err("expiresInDays")}
          />
          <div className="ui-field">
            <label className="ui-label" htmlFor="invite-maxUses">
              {t("invites.maxUses")}
            </label>
            <p className="ui-hint" id="invite-maxUses-hint">
              {t("invites.maxUsesHint")}
            </p>
            <input
              id="invite-maxUses"
              name="maxUses"
              type="number"
              inputMode="numeric"
              min={1}
              max={INVITE_LIMITS.maxUsesMax}
              className="ui-input"
              aria-describedby={err("maxUses") ? "invite-maxUses-hint invite-maxUses-error" : "invite-maxUses-hint"}
              aria-invalid={err("maxUses") ? true : undefined}
            />
            {err("maxUses") ? (
              <p className="ui-error-text" id="invite-maxUses-error">
                {err("maxUses")}
              </p>
            ) : null}
          </div>
          <div className="profile-form__actions">
            <SubmitButton label={t("invites.create")} pendingLabel={t("invites.creating")} />
          </div>
        </form>
      ) : null}

      {replaced.status === "error" && replaced.formError ? (
        <p className="ui-error-text" role="alert">
          {t(`errors.${replaced.formError}`)}
        </p>
      ) : null}

      <section className="profile-section" aria-labelledby="invite-list-title">
        <h2 id="invite-list-title" className="profile-section__title">
          {t("invites.listTitle")}
        </h2>
        {invites.length === 0 ? (
          <p className="text-muted">{t("invites.listEmpty")}</p>
        ) : (
          <ul className="group-list" data-testid="invite-list">
            {invites.map((invite) => (
              <li key={invite.id} className="group-row">
                <div className="group-row__main">
                  <span className="group-row__title">{t(`invites.status.${invite.state}`)}</span>
                  <span className="text-muted">
                    {t("invites.created", { date: date(invite.createdAt) })}
                    {" · "}
                    {invite.state === "active" || invite.state === "used_up"
                      ? t("invites.expiresOn", { date: date(invite.expiresAt) })
                      : t("invites.expiredOn", { date: date(invite.expiresAt) })}
                    {" · "}
                    {invite.maxUses !== null
                      ? t("invites.usesOf", { count: invite.useCount, max: invite.maxUses })
                      : t("invites.uses", { count: invite.useCount })}
                  </span>
                </div>
                {invite.state === "active" && !archived ? (
                  <div className="group-row__actions">
                    <form action={replace}>
                      <input type="hidden" name="inviteId" value={invite.id} />
                      <ReplaceButton />
                    </form>
                    <details className="group-confirm">
                      <summary className={buttonVariants({ variant: "ghost", size: "sm" })}>
                        {t("invites.revoke")}
                      </summary>
                      <form action={revokeInviteAction.bind(null, groupId)} className="group-confirm__body">
                        <p>{t("invites.confirmRevoke")}</p>
                        <input type="hidden" name="inviteId" value={invite.id} />
                        <Button type="submit" variant="secondary" size="sm">
                          {t("invites.revoke")}
                        </Button>
                      </form>
                    </details>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
