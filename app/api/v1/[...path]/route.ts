import { restRoute, runtime } from "@/backend";

// The REST API: every operation in backend/rest.ts's table, and its description at /api/v1/openapi.json.
type Ctx = { params: Promise<{ path: string[] }> };
const handle = async (req: Request, { params }: Ctx) => restRoute(req, runtime(), (await params).path);
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
