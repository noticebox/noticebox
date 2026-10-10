import { authorizeRoute, runtime } from "@/backend";

export const POST = (req: Request) => authorizeRoute(req, runtime());
