import { authServerRoute, metadataPreflight, runtime } from "@/backend";

// Depends on the request host and the runtime secret: never prerendered.
export const dynamic = "force-dynamic";

export const GET = (req: Request) => authServerRoute(req, runtime());
export const OPTIONS = () => metadataPreflight(runtime());
