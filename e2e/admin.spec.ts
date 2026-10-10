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

  // The form starts without fields: the first post brings them, and the settings page lists what it saw.
  await expect(page.getByText("Seen in submissions")).toHaveCount(0);
  expect((await request.post("/f/orders", { data: { name: "Ann", email: "ann@example.org", message: "Two", quantity: "2", _public: "quantity" } })).status()).toBe(201);
  await page.reload();
  await expect(page.getByText("Seen in submissions")).toContainText("name");
  await expect(page.getByLabel("Field 1 name")).toHaveValue("quantity"); // described by the page's hint
  await page.getByRole("button", { name: "message", exact: true }).click();
  await page.getByLabel("Field 2 label").fill("The message");
  await page.getByRole("button", { name: "Add a state" }).click();
  await page.getByLabel("State 3 name").fill("forwarded");
  await page.getByRole("button", { name: "Add a target" }).click();
  await page.getByLabel("Target 1 URL").fill("https://hooks.test/orders");
  await page.getByLabel("Target 1 type").selectOption("webhook");
  await page.getByLabel("Takes posts from").fill("https://example.org");
  await page.getByRole("button", { name: "Save the settings" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  const file = JSON.parse(readFileSync(".e2e/noticebox.json", "utf8")) as { boxes?: string[]; forms: Record<string, { box: string; fields: Record<string, unknown>; notify: unknown; origins: string[] }> };
  expect(file.forms.orders).toMatchObject({ box: "example.org", origins: ["https://example.org"], notify: [{ type: "webhook", url: "https://hooks.test/orders" }], states: [{ name: "new" }, { name: "answered", closed: true }, { name: "forwarded" }] });
  expect(Object.keys(file.forms.orders!.fields)).toEqual(["quantity", "message"]);
  expect(file.forms.report!.notify).toEqual({ ntfy: "${NTFY_URL}" }); // the other form's secret stays a reference
  expect(file.boxes ?? []).not.toContain("example.org"); // the box has a form now

  // A refused save keeps what was typed and says why.
  await page.getByLabel("Personal fields are removed").fill("0");
  await page.getByRole("button", { name: "Save the settings" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("retentionDays");
  await expect(page.getByLabel("State 3 name")).toHaveValue("forwarded");

  // The new form now takes posts from its origin only, like any other, and the new state can be used.
  expect((await request.post("/f/orders", { data: { name: "Ann", email: "ann@example.org", message: "Two", quantity: "2" } })).status()).toBe(403);
  expect((await request.post("/f/orders", { data: { name: "Ann", email: "ann@example.org", message: "Two", quantity: "2" }, headers: { origin: "https://example.org" } })).status()).toBe(201);
  await page.reload();
  await expect(page.getByRole("button", { name: "Remove the form" })).toBeDisabled();
  await page.goto("/forms/orders/submissions");
  await page.locator("[data-hydrated]").first().waitFor();
  await page.getByRole("button", { name: "State: new" }).first().click();
  await page.getByRole("menuitem", { name: "Mark as forwarded" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Mark as forwarded" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("button", { name: "State: forwarded" }).first()).toBeVisible();

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
  await page.getByLabel("Box").fill("scratch box");
  await page.getByRole("button", { name: "Create the form" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("add the one you typed"); // not yet added
  await page.getByRole("button", { name: "Add “scratch box” as a new box" }).click();
  await expect(page.getByText("will be made with the form")).toBeVisible();
  await page.getByRole("button", { name: "Create the form" }).click();
  await expect(page).toHaveURL(/\/forms\/scratch\/settings$/);
  await page.getByRole("button", { name: "Remove the form" }).click();
  await expect(page).toHaveURL(/\/$|\/forms\/report$/);
  await page.goto("/boxes/scratch%20box");
  await page.getByRole("button", { name: "Remove the box" }).click();
  await expect(page).toHaveURL(/\/forms\/report$/);
  await expect(page.getByRole("complementary").first().getByText("scratch box")).toHaveCount(0);
});
