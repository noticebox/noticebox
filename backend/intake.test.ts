import { expect, test } from "vitest";
import { intakePreflight, intakeRoute } from "./intake";
import { Rate } from "./runtime";
import { BASE, formPost, jsonPost, REPORT, testRuntime, until } from "./testutil";

test("a browser submission is stored, answered with a redirect, and announced without its content", async () => {
  const rt = testRuntime();
  const res = await intakeRoute(formPost("/f/report", REPORT), "report", rt);
  expect(res.status).toBe(303);
  expect(res.headers.get("location")).toBe("/f/report/thanks");
  const [s] = rt.store.list();
  expect(s).toBeDefined();
  expect(s!.state).toBe("open");
  expect(s!.fields).toEqual({ ...REPORT, text: "This is spam.\nSecond line." });
  expect(rt.store.events(s!.id).map((e) => e.actor)).toEqual(["form"]);

  await until(() => rt.hits.length === 2);
  const ntfy = rt.hits.find((h) => h.url === "https://ntfy.test/topic")!;
  const hook = rt.hits.find((h) => h.url === "https://hook.test/in")!;
  expect(ntfy.body).toBe(`${BASE}/s/${s!.id}`);
  expect(ntfy.headers.title).toBe("New report: Report content");
  expect(JSON.parse(hook.body)).toEqual({ form: "report", kind: "report", id: s!.id, received_at: s!.received_at, url: `${BASE}/s/${s!.id}` });
  for (const h of rt.hits) expect(h.body + JSON.stringify(h.headers)).not.toMatch(/spam|example\.org/i);
});

test("a JSON submission gets its id back; what is missing or wrong is named", async () => {
  const rt = testRuntime();
  const ok = await intakeRoute(jsonPost("/f/report", { ...REPORT, extra: "dropped", n: 5 }), "report", rt);
  expect(ok.status).toBe(201);
  const { id } = (await ok.json()) as { id: string };
  expect(rt.store.get(id)?.fields).toEqual({ ...REPORT, text: "This is spam.\nSecond line." });

  const bad = await intakeRoute(jsonPost("/f/report", { reason: "Nope", email: "not-an-email", text: "x".repeat(2001) }), "report", rt);
  expect(bad.status).toBe(400);
  expect(await bad.json()).toEqual({ errors: ["Reason must be one of the given choices", "What is wrong is too long (at most 2000 characters)", "Your email is not an email address"] });

  expect((await intakeRoute(jsonPost("/f/report", "["), "report", rt)).status).toBe(400);
  expect((await intakeRoute(jsonPost("/f/report", "[1]"), "report", rt)).status).toBe(400);
  expect((await intakeRoute(new Request(`${BASE}/f/report`, { method: "POST", headers: { "content-type": "text/plain" }, body: "hi" }), "report", rt)).status).toBe(415);
  expect((await intakeRoute(jsonPost("/f/nope", REPORT), "nope", rt)).status).toBe(404);
  expect(rt.store.list()).toHaveLength(1);
});

test("a refused browser submission goes back to the form with what was typed and what is wrong", async () => {
  const rt = testRuntime();
  const res = await intakeRoute(formPost("/f/report", { read_id: "r1", text: "only text" }), "report", rt);
  expect(res.status).toBe(303);
  const back = new URL(res.headers.get("location")!, BASE);
  expect(back.pathname).toBe("/f/report");
  expect(back.searchParams.getAll("error")).toEqual(["Reason is required"]);
  expect(back.searchParams.get("read_id")).toBe("r1");
  expect(back.searchParams.get("text")).toBe("only text");
  expect(rt.store.list()).toHaveLength(0);
});

test("the honeypot swallows bots: same answer, nothing stored", async () => {
  const rt = testRuntime();
  const res = await intakeRoute(formPost("/f/report", { ...REPORT, _gotcha: "http://spam" }), "report", rt);
  expect(res.status).toBe(303);
  expect(rt.store.list()).toHaveLength(0);
  await new Promise((r) => setTimeout(r, 30));
  expect(rt.hits).toHaveLength(0);
});

test("a form with origins takes submissions only from them, with CORS for scripts", async () => {
  const rt = testRuntime();
  const data = { name: "Ann", email: "ann@example.org", message: "Hello" };
  expect((await intakeRoute(formPost("/f/contact", data), "contact", rt)).status).toBe(403);
  expect((await intakeRoute(formPost("/f/contact", data, { origin: "https://evil.example" }), "contact", rt)).status).toBe(403);
  const byReferer = await intakeRoute(formPost("/f/contact", data, { referer: "https://example.org/contact" }), "contact", rt);
  expect(byReferer.status).toBe(303);
  expect(byReferer.headers.get("location")).toBe("https://example.org/thanks");
  const ok = await intakeRoute(jsonPost("/f/contact", data, { origin: "https://example.org" }), "contact", rt);
  expect(ok.status).toBe(201);
  expect(ok.headers.get("access-control-allow-origin")).toBe("https://example.org");
  const pre = intakePreflight("contact", new Headers({ origin: "https://example.org" }), rt);
  expect(pre.status).toBe(204);
  expect(pre.headers.get("access-control-allow-methods")).toBe("POST");
  expect(intakePreflight("contact", new Headers({ origin: "https://evil.example" }), rt).status).toBe(403);
  expect(intakePreflight("report", new Headers(), rt).headers.get("access-control-allow-origin")).toBe("*");
  const stored = rt.store.list({ form: "contact" });
  expect(stored).toHaveLength(2);
  expect(stored[0]!.state).toBe("new");
  expect(stored[0]!.origin).toBe("https://example.org");
});

test("too many submissions from one address are refused for a while; a body over the limit too", async () => {
  const rt = testRuntime({ rate: new Rate(2), bodyLimit: 1000 });
  const post = (ip: string) => intakeRoute(formPost("/f/report", REPORT, { "x-forwarded-for": `${ip}, 10.0.0.1` }), "report", rt);
  expect((await post("1.1.1.1")).status).toBe(303);
  expect((await post("1.1.1.1")).status).toBe(303);
  const third = await post("1.1.1.1");
  expect(third.status).toBe(429);
  expect(third.headers.get("retry-after")).toBe("600");
  expect((await post("2.2.2.2")).status).toBe(303);
  expect(rt.store.list()).toHaveLength(3);
  expect((await intakeRoute(formPost("/f/report", { ...REPORT, text: "y".repeat(1500) }, { "x-forwarded-for": "3.3.3.3" }), "report", rt)).status).toBe(413);
});
