import { metadataPreflight, protectedResourceRoute, runtime } from "@/backend";

// Depends on the request host and the runtime secret: never prerendered.
export const dynamic = "force-dynamic";

export const GET = (req: Request) => protectedResourceRoute(req, runtime());
export const OPTIONS = () => metadataPreflight(runtime());
