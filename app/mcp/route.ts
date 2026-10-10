import { mcpRoute, runtime } from "@/backend";

// MCP over Streamable HTTP is POST only here; there is no server-sent stream or session to GET or DELETE.
export const POST = (req: Request) => mcpRoute(req, runtime());
const notAllowed = () => new Response(null, { status: 405, headers: { Allow: "POST" } });
export const GET = notAllowed;
export const DELETE = notAllowed;
