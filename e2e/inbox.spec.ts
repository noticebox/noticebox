import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";

// A stand-in for ntfy on the port the server's configuration names (playwright.config.ts): what the app sends there.
const pings: { url: string; title: string | undefined; body: string }[] = [];
let ntfy: Server;
test.beforeAll(async () => {
  ntfy = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      pings.push({ url: req.url ?? "", title: req.headers.title as string | undefined, body });
      res.end("ok");
    });
  });
  await new Promise<void>((r) => ntfy.listen(3399, "127.0.0.1", r));
});
test.afterAll(() => new Promise<void>((r) => ntfy.close(() => r())));

const USER = { "x-user": "marcel" };

test("without the login header the inbox is closed; the public side is open", async ({ browser, request }) => {
  const anonymous = await browser.newContext({ extraHTTPHeaders: {} });
  const page = await anonymous.newPage();
  const res = await page.goto("/");
  expect(res?.status()).toBe(401);
  expect((await page.goto("/f/report"))?.status()).toBe(200);
  await anonymous.close();
  expect((await request.get("/healthz")).status()).toBe(200);
  const mcp = await request.post("/mcp", { data: {} });
  expect(mcp.status()).toBe(401);
  expect(mcp.headers()["www-authenticate"]).toContain("resource_metadata=");
  expect((await request.get("/.well-known/oauth-authorization-server")).ok()).toBeTruthy();
});

test("a report goes from the hosted form through the inbox to a recorded decision", async ({ page, request }) => {
  await page.goto("/f/report?read_id=r1&note_id=n1&file=a.png");
  await expect(page.getByLabel("File")).toHaveValue("a.png");
  await expect(page.getByLabel("File")).toHaveAttribute("readonly", "");
  await expect(page.locator('input[name="read_id"]')).toBeHidden();

  // Refused by the server (a browser's own check is skipped here): the reason is missing, the text comes back.
  const refused = await request.post("/f/report", { form: { read_id: "r1", file: "a.png", text: "This note shows my address." }, maxRedirects: 0 });
  expect(refused.status()).toBe(303);
  await page.goto(refused.headers()["location"]!);
  await expect(page.locator("ul[role=alert]")).toContainText("Reason is required");
  await expect(page.getByLabel("What is wrong")).toHaveValue("This note shows my address.");
  await expect(page.getByLabel("File")).toHaveValue("a.png");
  await expect(page.locator('input[name="read_id"]')).toHaveValue("r1");

  await page.getByLabel("Reason").selectOption("Personal data");
  await page.getByLabel("Your email").fill("who@example.org");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page).toHaveURL(/\/f\/report\/thanks$/);
  await expect(page.getByText("Thank you")).toBeVisible();

  await expect.poll(() => pings.length).toBe(1);
  expect(pings[0]!.url).toBe("/reports");
  expect(pings[0]!.title).toBe("New report: Report content");
  expect(pings[0]!.body).toMatch(/^http:\/\/localhost:3300\/s\/[A-Za-z0-9_-]+$/);
  expect(pings[0]!.body + pings[0]!.title).not.toContain("address");

  // The inbox, with the login header the proxy would set.
  await page.setExtraHTTPHeaders(USER);
  await page.goto("/");
  await expect(page.getByText(/Report content: \d+ open/)).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: "This note shows my address." });
  await expect(row.getByRole("cell", { name: "open" })).toBeVisible();
  await row.getByRole("link").click();
  await expect(page).toHaveURL(/\/s\/[A-Za-z0-9_-]+$/);
  await expect(page.getByText("received as")).toBeVisible();
  await expect(page.getByText("who@example.org")).toBeVisible();
  await expect(page.getByText("r1", { exact: true })).toBeVisible();

  // Closing without a reason is refused; with one, it is recorded in the signed-in person's name.
  await page.locator("form[data-hydrated]").waitFor();
  await page.getByLabel("Move to").selectOption("acted_on");
  await page.getByRole("button", { name: "Record" }).click();
  await expect(page.locator("p[role=alert]")).toHaveText("acted_on needs a reason");
  await expect(page.getByLabel("Move to")).toHaveValue("acted_on"); // the refusal keeps the choice
  await page.getByLabel("Reason").fill("Address blurred, reporter informed.");
  await page.getByRole("button", { name: "Record" }).click();
  const decided = page.locator("ol li").filter({ hasText: "Address blurred, reporter informed." });
  await expect(decided).toContainText("marcel moved open to acted_on");
  await expect(page.locator("main p").first()).toContainText("closed 20");

  // A note after the fact, no state change.
  await page.getByLabel("Reason").fill("Reporter said thanks.");
  await page.getByRole("button", { name: "Record" }).click();
  await expect(page.locator("ol li").filter({ hasText: "Reporter said thanks." })).toContainText("marcel noted");
  await expect(page.locator("main p").first()).toContainText("state acted_on");

  await page.goto("/");
  await expect(page.getByText(/Report content: \d+ open/)).toBeVisible();
  await expect(page.getByText("This note shows my address.")).toHaveCount(0);
  await page.goto("/?open=0");
  await expect(page.getByText("This note shows my address.")).toBeVisible();

  const exported = (await (await request.get("/export.json?form=report", { headers: USER })).json()) as { state: string; events: unknown[] }[];
  expect(exported[0]!.state).toBe("acted_on");
  expect(exported[0]!.events).toHaveLength(3);
});

test("a contact message from a script: only from the allowed origin, with CORS", async ({ request }) => {
  const data = { name: "Ann", email: "ann@example.org", message: "Hello there" };
  expect((await request.post("/f/contact", { data })).status()).toBe(403);
  const ok = await request.post("/f/contact", { data, headers: { origin: "https://example.org" } });
  expect(ok.status()).toBe(201);
  expect(ok.headers()["access-control-allow-origin"]).toBe("https://example.org");
  const { id } = (await ok.json()) as { id: string };
  const pre = await request.fetch("/f/contact", { method: "OPTIONS", headers: { origin: "https://example.org" } });
  expect(pre.status()).toBe(204);
  const detail = await request.get(`/s/${id}`, { headers: USER });
  expect(await detail.text()).toContain("Hello there");
});
