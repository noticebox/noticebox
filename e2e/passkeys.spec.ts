import { expect, test } from "@playwright/test";

// A passkey is added in Your settings and signs in on the sign-in page. Chromium's virtual authenticator stands in for
// the device: it answers the browser's WebAuthn calls and keeps the credential for this page. Only this page's cookies
// are cleared, so the shared session the other tests use stays valid.
test("a passkey added in Your settings signs in, and is removed again", async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true },
  });

  await page.goto("/settings");
  await expect(page.getByText("No passkey yet.")).toBeVisible();
  await page.getByLabel("Name (to tell your passkeys apart)").fill("Test laptop");
  await page.getByRole("button", { name: "Add a passkey" }).click();
  await expect(page.getByText("Test laptop")).toBeVisible();

  await page.context().clearCookies();
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/login/);
  await page.getByRole("button", { name: "Sign in with a passkey" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByText("Signed in as")).toContainText("marcel@example.org");

  await page.getByRole("button", { name: "Remove the passkey Test laptop" }).click();
  await expect(page.getByText("No passkey yet.")).toBeVisible();
});
