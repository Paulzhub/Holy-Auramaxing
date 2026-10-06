import { CircleAlert, Download, Info } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { buttonVariants } from "@/components/ui/button-variants";

import { keepAccountAction, requestAccountDeletionAction } from "../server/deletion-actions";

// Server components for "Your data" and account deletion (D-032, D-033).
// Every control is a plain form, so none of this needs JavaScript.

const notices = [
  "account-kept",
  "requested",
  "export-rate-limited",
  "export-failed",
  "rate-limited",
  "failed",
] as const;
type Notice = (typeof notices)[number];

/** A known ?notice= value; anything else is ignored, so the URL can't inject text. */
export async function AccountDataNotice({ notice }: { notice: string | string[] | undefined }) {
  const value = Array.isArray(notice) ? notice[0] : notice;
  if (!value || !(notices as readonly string[]).includes(value)) return null;
  const t = await getTranslations("accountData.notices");
  return (
    <p className="auth-banner" role="status">
      <Info aria-hidden="true" />
      <span>{t(value as Notice)}</span>
    </p>
  );
}

/** POSTs to /api/account/export, which answers with the zip as a download. */
export async function ExportDataForm({ from = "settings" }: { from?: "settings" | "closing" }) {
  const t = await getTranslations("accountData.export");
  return (
    <form method="post" action="/api/account/export">
      <input type="hidden" name="from" value={from} />
      <button type="submit" className={buttonVariants({ variant: from === "closing" ? "secondary" : "primary" })}>
        <Download aria-hidden="true" />
        {t("button")}
      </button>
    </form>
  );
}

const deleteErrors = ["confirm", "rate-limited", "failed"] as const;
type DeleteError = (typeof deleteErrors)[number];

export async function DeleteAccountForm({ error }: { error: string | string[] | undefined }) {
  const t = await getTranslations("accountData.deletePage");
  const value = Array.isArray(error) ? error[0] : error;
  const problem = value && (deleteErrors as readonly string[]).includes(value) ? (value as DeleteError) : null;
  const confirmMissing = problem === "confirm";

  return (
    <form action={requestAccountDeletionAction} className="auth-form" noValidate>
      {problem ? (
        // Server-rendered: the redirect lands on #delete-errors, so the browser
        // scrolls here and starts keyboard focus from it, even without JavaScript.
        <div id="delete-errors" className="auth-error-summary" role="alert" tabIndex={-1}>
          <h2 className="auth-error-summary__title">
            <CircleAlert aria-hidden="true" />
            {t("errorSummaryTitle")}
          </h2>
          <ul>
            <li>{confirmMissing ? <a href="#delete-confirm">{t(`errors.${problem}`)}</a> : t(`errors.${problem}`)}</li>
          </ul>
        </div>
      ) : null}
      <div className="auth-check">
        <input
          type="checkbox"
          id="delete-confirm"
          name="confirm"
          value="yes"
          required
          aria-invalid={confirmMissing ? true : undefined}
          aria-describedby={confirmMissing ? "delete-confirm-error" : undefined}
        />
        <label htmlFor="delete-confirm">{t("confirm")}</label>
      </div>
      {confirmMissing ? (
        <p className="ui-error-text" id="delete-confirm-error">
          <CircleAlert aria-hidden="true" />
          <span>{t("errors.confirm")}</span>
        </p>
      ) : null}
      <div>
        <button type="submit" className={buttonVariants({ variant: "primary" })}>
          {t("submit")}
        </button>
      </div>
    </form>
  );
}

export async function KeepAccountForm() {
  const t = await getTranslations("accountData.closing");
  return (
    <form action={keepAccountAction}>
      <button type="submit" className={buttonVariants({ variant: "primary", size: "lg" })}>
        {t("keep")}
      </button>
    </form>
  );
}
