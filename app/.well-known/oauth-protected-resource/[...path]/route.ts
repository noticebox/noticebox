import { apiResourceMetadataRoute, authRoute, runtime } from "@/backend";

// RFC 9728 metadata: of /api/v1 (/.well-known/oauth-protected-resource/api/v1) from noticebox, of /mcp from @better-auth/mcp.
export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return (await params).path.join("/") === "api/v1" ? apiResourceMetadataRoute(runtime()) : authRoute(req, runtime());
}
