import { getTranslations } from "next-intl/server";

import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/cn";

import { finishOnboardingAction } from "../server/onboarding-actions";

/**
 * Plain forms (no client JavaScript) that finish onboarding. `to` continues
 * into starting or joining a group; the label then comes from the caller.
 */
export async function FinishOnboardingButton({
  to = "/home",
  label,
  variant = "primary",
}: {
  to?: "/home" | "/groups/new" | "/join";
  label?: string;
  variant?: "primary" | "secondary";
} = {}) {
  const t = await getTranslations("onboarding");
  return (
    <form action={finishOnboardingAction}>
      <input type="hidden" name="then" value={to} />
      <button type="submit" className={cn(buttonVariants({ size: "lg", variant }), "auth-submit")}>
        {label ?? t("group.finish")}
      </button>
    </form>
  );
}

export async function SkipSetupButton() {
  const t = await getTranslations("onboarding");
  return (
    <form action={finishOnboardingAction} className="onboarding-skip">
      <button type="submit" className={buttonVariants({ variant: "ghost", size: "sm" })}>
        {t("skipSetup")}
      </button>
    </form>
  );
}
