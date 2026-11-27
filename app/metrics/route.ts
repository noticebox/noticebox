import { metricsRoute, runtime } from "@/backend";

export const dynamic = "force-dynamic";

// The bearer token is checked in the backend; the sign-in proxy lets /metrics through to it.
export function GET(req: Request): Response {
  return metricsRoute(req, runtime());
}
