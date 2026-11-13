import { fileRoute, runtime } from "@/backend";

export const dynamic = "force-dynamic";

// A file that came with a submission: a download, or with ?inline=1 a picture to show. For a signed-in person, or for
// whoever holds a signed link (backend/files.ts).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  return fileRoute(req, runtime(), (await params).id);
}
