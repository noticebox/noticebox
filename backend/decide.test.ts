// A decision is stored first and posted after, to the webhooks that asked for decisions; a refused one posts nothing, and a
// webhook that is down changes nothing about the answer.
import { expect, test } from "vitest";
import { parseConfig } from "./config";
import { decide } from "./decide";
import { BASE, REPORT, testRuntime, until } from "./testutil";

const HOOK = "https://hook.test/decided";
const config = () =>
  parseConfig({
    forms: {
      report: {
        kind: "report",
        fields: { reason: {}, text: {}, email: { type: "email" } },
        notify: [
          { type: "ntfy", url: "https://ntfy.test/topic" },
          { type: "webhook", url: HOOK, on: ["decided"] },
        ],
      },
    },
  });

test("a decision is stored, then posted", async () => {
  const rt = testRuntime({ config: config(), now: () => new Date("2026-11-20T10:00:00.000Z") });
  const form = rt.config.forms.report!;
  const id = rt.store.receive(form, REPORT, null, new Date()).id;
  expect(decide(rt, form, id, "marcel@test.example", "rejected", "Not spam.", BASE)).toEqual({ ok: true });
  expect(rt.store.get(id)!.state).toBe("rejected");
  await until(() => rt.hits.length === 1);
  expect(rt.hits[0]!.url).toBe(HOOK);
  expect(JSON.parse(rt.hits[0]!.body)).toEqual({
    event: "decided",
    form: "report",
    kind: "report",
    id,
    from: "open",
    to: "rejected",
    at: "2026-11-20T10:00:00.000Z",
    url: `${BASE}/forms/report/submissions/${id}`,
  });
});

test("a refused decision posts nothing", async () => {
  const rt = testRuntime({ config: config() });
  const form = rt.config.forms.report!;
  const id = rt.store.receive(form, REPORT, null, new Date()).id;
  expect(decide(rt, form, id, "m", "nowhere", "", BASE)).toMatchObject({ ok: false });
  expect(decide(rt, form, id, "m", "open", "", BASE)).toMatchObject({ ok: false, error: "already open" });
  await new Promise((r) => setTimeout(r, 20));
  expect(rt.hits).toEqual([]);
});

test("a webhook down doesn't change the answer", async () => {
  const lines: string[] = [];
  const rt = testRuntime({
    config: config(),
    log: (l) => void lines.push(l),
    fetch: (async () => {
      throw new Error("connect ECONNREFUSED");
    }) as typeof fetch,
  });
  const form = rt.config.forms.report!;
  const id = rt.store.receive(form, REPORT, null, new Date()).id;
  expect(decide(rt, form, id, "m", "rejected", "Not spam.", BASE)).toEqual({ ok: true });
  await until(() => lines.length === 1);
  expect(lines[0]).toBe(`notify report ${id} webhook hook.test: connect ECONNREFUSED`);
});
