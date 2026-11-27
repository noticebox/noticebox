import { wellKnownHandlers } from "next-app-kit/next";
import { kitAuth } from "@/backend";

// OpenID discovery for the issuer <base>/api/auth.
export const GET = wellKnownHandlers(kitAuth).openidConfiguration;
