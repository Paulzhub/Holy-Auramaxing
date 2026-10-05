"use client";

import { useTranslations } from "next-intl";

import { confirmLinkAction } from "../server/actions";
import { SubmitButton } from "./form-parts";

/**
 * Email links land on a page with this button instead of signing in on the
 * GET request, so email security scanners that open links can't use up the
 * one-time token before the person does.
 */
export function ConfirmLinkForm({ tokenHash, type, next }: { tokenHash: string; type: string; next?: string }) {
  const t = useTranslations("auth.confirm");
  return (
    <form action={confirmLinkAction} className="auth-form">
      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="type" value={type} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <SubmitButton pendingLabel={t("pending")}>{t("submit")}</SubmitButton>
    </form>
  );
}
