import type { Runtime } from "./runtime";

/** For the container health check and uptime monitors: 200 when the database works and the forms are loaded, else 503. */
export function healthRoute(rt: Runtime): Response {
  const checks: Record<string, "ok" | "fail"> = { database: "ok", forms: "ok" };
  try {
    rt.store.ping();
  } catch (e) {
    rt.log(`health: database: ${e instanceof Error ? e.message : String(e)}`);
    checks.database = "fail";
  }
  if (!rt.config) checks.forms = "fail";
  const ok = Object.values(checks).every((v) => v === "ok");
  return Response.json({ ok, checks }, { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}
