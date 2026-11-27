import { wellKnownHandlers } from "next-app-kit/next";
import { kitAuth } from "@/backend";

// RFC 9728 metadata of /api/v1 and of /mcp.
export const GET = wellKnownHandlers(kitAuth).protectedResource;
