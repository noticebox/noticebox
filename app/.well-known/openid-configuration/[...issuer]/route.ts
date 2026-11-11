import { openIdConfigRoute, runtime } from "@/backend";

// OpenID discovery for the issuer <base>/api/auth.
export const GET = (req: Request) => openIdConfigRoute(req, runtime());
