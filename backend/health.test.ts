import { expect, test } from "vitest";
import { healthRoute } from "./health";
import { testRuntime } from "./testutil";

test("health is 200 when the database and forms work", async () => {
  const res = healthRoute(testRuntime());
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true, checks: { database: "ok", forms: "ok" } });
});

test("health is 503 when the database fails", async () => {
  const rt = testRuntime();
  rt.store.db.close();
  rt.log = () => {};
  const res = healthRoute(rt);
  expect(res.status).toBe(503);
  expect(((await res.json()) as { checks: { database: string } }).checks.database).toBe("fail");
});
