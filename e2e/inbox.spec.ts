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
const REPORT = { read_id: "r1", note_id: "n1", file: "a.png", reason: "Personal data", text: "This note shows my address.", email: "who@example.org" };

test("without the login header the inbox is closed; the public side is open", async ({ browser, request }) => {
  const anonymous = await browser.newContext({ extraHTTPHeaders: {} });
  const page = await anonymous.newPage();
  expect((await page.goto("/"))?.status()).toBe(401);
  expect((await page.goto("/forms/report"))?.status()).toBe(401);
  expect((await page.goto("/f/report/thanks"))?.status()).toBe(200);
  await anonymous.close();
  expect((await request.get("/healthz")).status()).toBe(200);
  const mcp = await request.post("/mcp", { data: {} });
  expect(mcp.status()).toBe(401);
  expect(mcp.headers()["www-authenticate"]).toContain("resource_metadata=");
  expect((await request.get("/.well-known/oauth-authorization-server")).ok()).toBeTruthy();
});

test("a report goes from a page's form through the inbox to a recorded decision", async ({ page, request }) => {
  // The page that posted it is where a refused post goes back to, with what was typed and what is wrong.
  const refused = await request.post("/f/report", { form: { read_id: "r1", file: "a.png", text: REPORT.text }, headers: { referer: "https://notes.test/report?read_id=r1" }, maxRedirects: 0 });
  expect(refused.status()).toBe(303);
  const back = new URL(refused.headers()["location"]!);
  expect(back.origin + back.pathname).toBe("https://notes.test/report");
  expect(back.searchParams.getAll("error")).toEqual(["Reason is required"]);
  expect(back.searchParams.get("text")).toBe(REPORT.text);

  const sent = await request.post("/f/report", { form: REPORT, maxRedirects: 0 });
  expect(sent.status()).toBe(303);
  expect(sent.headers()["location"]).toBe("/f/report/thanks");
  await page.goto("/f/report/thanks");
  await expect(page.getByText("Thank you")).toBeVisible();

  await expect.poll(() => pings.length).toBe(1);
  expect(pings[0]!.url).toBe("/reports");
  expect(pings[0]!.title).toBe("New report: Report content");
  expect(pings[0]!.body).toMatch(/^http:\/\/localhost:3300\/forms\/report\/submissions\/[A-Za-z0-9_-]+$/);
  expect(pings[0]!.body + pings[0]!.title).not.toContain("address");

  // The inbox, with the login header the proxy would set: the sidebar, the overview, the table.
  await page.setExtraHTTPHeaders(USER);
  await page.goto("/");
  await expect(page).toHaveURL(/\/forms\/report$/);
  const sidebar = page.getByRole("complementary").first();
  await expect(sidebar.getByText("notes.test")).toBeVisible();
  await expect(sidebar.getByRole("link", { name: /Report content \d+/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Report content/ })).toBeVisible();
  await expect(page.getByText(/1 report waits for a decision/)).toBeVisible();
  await expect(page.getByText("Received per day")).toBeVisible();
  await expect(page.getByText("http://localhost:3300/f/report")).toBeVisible();
  await page.getByRole("link", { name: "Submissions" }).click();
  await expect(page).toHaveURL(/\/forms\/report\/submissions$/);
  const row = page.getByRole("row").filter({ hasText: REPORT.text });
  await expect(row.getByRole("button", { name: "State: open" })).toBeVisible();

  // Closing from the table: the dropdown on the state, then the dialog; without a reason it is refused and the
  // choice stays, with one it is recorded in the signed-in person's name.
  await row.locator("[data-hydrated]").waitFor();
  await row.getByRole("button", { name: "State: open" }).click();
  await row.getByRole("menuitem", { name: "Mark as acted on" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Mark as acted on" })).toBeVisible();
  // The browser's own check is skipped: the server has to refuse a decision without a reason too.
  // The button follows the choice in "Then"; keeping the state makes it a plain note.
  await dialog.getByLabel("Then").selectOption("");
  await expect(dialog.getByRole("button", { name: "Add a note" })).toBeVisible();
  await dialog.getByLabel("Then").selectOption("acted_on");
  await dialog.getByLabel("Reason").evaluate((el) => el.removeAttribute("required"));
  await dialog.getByRole("button", { name: "Mark as acted on" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("acted_on needs a reason");
  await expect(dialog.getByLabel("Then")).toHaveValue("acted_on");
  await dialog.getByLabel("Reason").fill("Address blurred, reporter informed.");
  await dialog.getByRole("button", { name: "Mark as acted on" }).click();
  await expect(dialog).toBeHidden();
  await expect(row.getByRole("button", { name: "State: acted on" })).toBeVisible(); // the table keeps every state
  await page.getByLabel("Filter by state").selectOption("open"); // "Open" hides what is closed
  await expect(page.getByText(REPORT.text)).toHaveCount(0);
  await page.getByLabel("Filter by state").selectOption("all");
  await page.getByLabel("Filter submissions").fill("nothing like this");
  await expect(page.getByText("Nothing matches.")).toBeVisible();
  await page.getByLabel("Filter submissions").fill("");

  // The detail: fields, history, a note after the fact.
  await row.getByRole("link", { name: REPORT.text }).click();
  await expect(page).toHaveURL(/\/forms\/report\/submissions\/[A-Za-z0-9_-]+$/);
  await expect(page.getByText("who@example.org")).toBeVisible();
  await expect(page.getByText("r1", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open the note" })).toHaveAttribute("href", "https://notes.test/r/r1/n1");
  const history = page.getByRole("list").filter({ hasText: "received it as" });
  await expect(history.getByRole("listitem").filter({ hasText: "Address blurred" })).toContainText("marcel moved it from open to acted on");
  await page.locator("[data-hydrated]").waitFor();
  await page.getByRole("button", { name: "Add a note" }).click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Add a note" })).toBeVisible();
  await page.getByRole("dialog").getByLabel("Note").fill("Reporter said thanks.");
  await page.getByRole("dialog").getByRole("button", { name: "Add a note" }).click();
  await expect(history.getByRole("listitem").filter({ hasText: "Reporter said thanks." })).toContainText("marcel noted");
  await expect(page.getByRole("button", { name: "State: acted on" })).toBeVisible();

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
  const short = await request.get(`/s/${id}`, { headers: USER, maxRedirects: 0 });
  expect(short.status()).toBe(307);
  expect(short.headers()["location"]).toBe(`/forms/contact/submissions/${id}`);
  const detail = await request.get(`/forms/contact/submissions/${id}`, { headers: USER });
  expect(await detail.text()).toContain("Hello there");
});
