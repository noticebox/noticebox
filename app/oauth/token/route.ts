import { runtime, tokenRoute } from "@/backend";

export const POST = (req: Request) => tokenRoute(req, runtime());
