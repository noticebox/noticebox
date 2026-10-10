import { registerPreflight, registerRoute, runtime } from "@/backend";

export const POST = (req: Request) => registerRoute(req, runtime());
export const OPTIONS = () => registerPreflight(runtime());
