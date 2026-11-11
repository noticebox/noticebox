import { authRoute, runtime } from "@/backend";

// Better Auth: sign-in, sessions, and the OAuth server for MCP clients (authorize, token, register, jwks).
export const GET = (req: Request) => authRoute(req, runtime());
export const POST = (req: Request) => authRoute(req, runtime());
