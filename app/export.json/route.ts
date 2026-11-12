import { actorOf, exportSubmissions, runtime } from "@/backend";

export const dynamic = "force-dynamic";

// Everything, or one form or state, as JSON with the events: for a backup, a spreadsheet or a lawyer.
export async function GET(req: Request): Promise<Response> {
  const rt = runtime();
  if (!(await actorOf(req.headers, rt))) return new Response("sign in first", { status: 401 });
  const url = new URL(req.url);
  const form = url.searchParams.get("form") ?? undefined;
  const state = url.searchParams.get("state") ?? undefined;
  const rows = exportSubmissions(rt, { form, state });
  return Response.json(rows, { headers: { "cache-control": "no-store" } });
}
