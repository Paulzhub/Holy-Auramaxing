import { LogOut } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { buttonVariants } from "@/components/ui/button-variants";

import { signOutAction } from "../server/actions";

/**
 * A plain form that posts to the sign-out Server Action. It needs no
 * JavaScript in the browser, so it adds nothing to the page's bundle and
 * works even if scripts fail to load.
 */
export async function SignOutButton() {
  const t = await getTranslations("auth.signOut");
  return (
    <form action={signOutAction}>
      <button type="submit" className={buttonVariants({ variant: "secondary" })}>
        <LogOut aria-hidden="true" />
        {t("button")}
      </button>
    </form>
  );
}
