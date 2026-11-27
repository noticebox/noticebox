import { wellKnownHandlers } from "next-app-kit/next";
import { kitAuth } from "@/backend";

// RFC 8414 metadata for the issuer <base>/api/auth, at /.well-known/oauth-authorization-server/api/auth.
export const GET = wellKnownHandlers(kitAuth).authorizationServer;
