import { healthRoute, runtime } from "@/backend";

export const dynamic = "force-dynamic";

export function GET(): Response {
  try {
    return healthRoute(runtime());
  } catch {
    // The runtime itself won't start (bad config, bad secret, unwritable data directory).
    return Response.json({ ok: false, checks: { startup: "fail" } }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
