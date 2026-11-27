import { restHandler } from "next-app-kit/next";
import { kitRest } from "@/backend";

// The REST API: every operation in backend/rest.ts's table, and its description at /api/v1/openapi.json.
export const { GET, POST, PUT, PATCH, DELETE } = restHandler(kitRest);
