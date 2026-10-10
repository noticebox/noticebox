import { actorOf, runtime } from "@/backend";

export const dynamic = "force-dynamic";

// Everything, or one form or state, as JSON with the events: for a backup, a spreadsheet or a lawyer.
export function GET(req: Request): Response {
  const rt = runtime();
  if (!actorOf(req.headers, rt)) return new Response("sign in first", { status: 401 });
  const url = new URL(req.url);
  const form = url.searchParams.get("form") ?? undefined;
  const state = url.searchParams.get("state") ?? undefined;
  const rows = rt.store.list({ form, state, limit: 1000 }).map((s) => ({ ...s, events: rt.store.events(s.id) }));
  return Response.json(rows, { headers: { "cache-control": "no-store" } });
}
