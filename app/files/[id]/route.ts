import { actorOf, fileResponse, runtime } from "@/backend";

export const dynamic = "force-dynamic";

// A file that came with a submission, for a signed-in person: a download, or with ?inline=1 a picture to show.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const rt = runtime();
  if (!(await actorOf(req.headers, rt))) return new Response("sign in first", { status: 401 });
  const { id } = await params;
  const res = fileResponse(rt, id, { inline: new URL(req.url).searchParams.get("inline") === "1" });
  return res ?? new Response("no such file", { status: 404 });
}
