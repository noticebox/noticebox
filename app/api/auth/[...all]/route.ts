import { authHandler } from "next-app-kit/next";
import { kitAuth } from "@/backend";

// Better Auth: sign-in, sessions, and the OAuth server for MCP clients and scripts (authorize, token, register, jwks).
export const { GET, POST } = authHandler(kitAuth);
