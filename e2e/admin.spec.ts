import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const USER = { "x-user": "marcel" };
test.use({ extraHTTPHeaders: USER });

test("a box and a form are made in the inbox, the form's settings are saved to the file, and the form is removed again", async ({ page, request }) => {
  await page.goto("/");
  const sidebar = page.getByRole("complementary").first();
  await sidebar.getByRole("button", { name: "Add new" }).click();
  await sidebar.getByRole("menuitem", { name: "New box" }).click();
  await expect(page).toHaveURL(/\/boxes\/new$/);
  await page.getByLabel("Name").fill("example.org");
  await page.getByRole("button", { name: "Create the box" }).click();
  await expect(page).toHaveURL(/\/boxes\/example\.org$/);
  await expect(page.getByText("No forms in this box yet.").first()).toBeVisible();

  await page.getByRole("link", { name: "New form in this box" }).click();
  await expect(page.getByLabel("Box")).toHaveValue("example.org");
  await page.getByLabel("Name").fill("orders");
  await page.getByLabel("Title").fill("Orders");
  await page.getByRole("radio", { name: /Message/ }).check();
  await page.getByRole("button", { name: "Create the form" }).click();
  await expect(page).toHaveURL(/\/forms\/orders\/settings$/);
  await expect(sidebar.getByRole("link", { name: /^Orders/ })).toBeVisible();

  // The settings: a field and a notification target added, saved, and in the file.
  await expect(page.getByLabel("Field 1 name")).toHaveValue("name");
  await page.getByRole("button", { name: "Add a field" }).click();
  await page.getByLabel("Field 4 name").fill("quantity");
  await page.getByLabel("Field 4 label").fill("How many");
  await page.getByRole("button", { name: "Add a target" }).click();
  await page.getByLabel("Target 1 URL").fill("https://hooks.test/orders");
  await page.getByLabel("Target 1 type").selectOption("webhook");
  await page.getByLabel("Takes posts from").fill("https://example.org");
  await page.getByRole("button", { name: "Save the settings" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  const file = JSON.parse(readFileSync(".e2e/noticebox.json", "utf8")) as { boxes?: string[]; forms: Record<string, { box: string; fields: Record<string, unknown>; notify: unknown; origins: string[] }> };
  expect(file.forms.orders).toMatchObject({ box: "example.org", origins: ["https://example.org"], notify: [{ type: "webhook", url: "https://hooks.test/orders" }] });
  expect(Object.keys(file.forms.orders!.fields)).toEqual(["name", "email", "message", "quantity"]);
  expect(file.forms.report!.notify).toEqual({ ntfy: "${NTFY_URL}" }); // the other form's secret stays a reference
  expect(file.boxes ?? []).not.toContain("example.org"); // the box has a form now

  // A refused save keeps what was typed and says why.
  await page.getByLabel("Personal fields are removed").fill("0");
  await page.getByRole("button", { name: "Save the settings" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("retentionDays");
  await expect(page.getByLabel("Field 4 name")).toHaveValue("quantity");

  // The new form takes posts from its origin only, like any other.
  expect((await request.post("/f/orders", { data: { name: "Ann", email: "ann@example.org", message: "Two", quantity: "2" } })).status()).toBe(403);
  expect((await request.post("/f/orders", { data: { name: "Ann", email: "ann@example.org", message: "Two", quantity: "2" }, headers: { origin: "https://example.org" } })).status()).toBe(201);
  await page.reload();
  await expect(page.getByRole("button", { name: "Remove the form" })).toBeDisabled();

  // The user menu and the settings page.
  await page.getByRole("button", { name: /marcel/ }).click();
  await page.getByRole("menuitem", { name: "Your settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByText("Signed in as")).toContainText("marcel");
  await expect(page.getByText("No assistant is connected.")).toBeVisible();
});

test("an empty form is removed, and an empty box too", async ({ page }) => {
  await page.goto("/forms/new");
  await page.getByLabel("Name").fill("scratch");
  await page.getByLabel("Box").selectOption("__new");
  await page.getByPlaceholder("Name of the new box (only if chosen above)").fill("scratch box");
  await page.getByRole("button", { name: "Create the form" }).click();
  await expect(page).toHaveURL(/\/forms\/scratch\/settings$/);
  await page.getByRole("button", { name: "Remove the form" }).click();
  await expect(page).toHaveURL(/\/$|\/forms\/report$/);
  await page.goto("/boxes/scratch%20box");
  await page.getByRole("button", { name: "Remove the box" }).click();
  await expect(page).toHaveURL(/\/forms\/report$/);
  await expect(page.getByRole("complementary").first().getByText("scratch box")).toHaveCount(0);
});
