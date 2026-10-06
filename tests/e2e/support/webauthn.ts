import type { Page } from "@playwright/test";

/**
 * A virtual passkey authenticator through the Chrome DevTools Protocol: it
 * answers navigator.credentials like a phone or laptop with a fingerprint
 * reader, with the person always "verified". Chromium only. Test-only.
 */
export async function addVirtualAuthenticator(page: Page): Promise<{ credentialCount(): Promise<number> }> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return {
    async credentialCount() {
      const { credentials } = await cdp.send("WebAuthn.getCredentials", { authenticatorId });
      return credentials.length;
    },
  };
}
