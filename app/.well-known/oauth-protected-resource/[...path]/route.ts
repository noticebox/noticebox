import { authRoute, runtime } from "@/backend";

// RFC 9728 metadata of /mcp, at /.well-known/oauth-protected-resource/mcp: @better-auth/mcp answers it.
export const GET = (req: Request) => authRoute(req, runtime());
