import { getTranslations } from "next-intl/server";

import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/cn";

import { finishOnboardingAction } from "../server/onboarding-actions";

/** Plain forms (no client JavaScript) that finish onboarding. */
export async function FinishOnboardingButton() {
  const t = await getTranslations("onboarding");
  return (
    <form action={finishOnboardingAction}>
      <button type="submit" className={cn(buttonVariants({ size: "lg" }), "auth-submit")}>
        {t("group.finish")}
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
