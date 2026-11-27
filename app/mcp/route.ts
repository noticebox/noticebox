import { mcpHandler } from "next-app-kit/next";
import { kitMcp } from "@/backend";

// MCP over Streamable HTTP, POST only: there is no server-sent stream or session to GET or DELETE.
export const { POST, GET, DELETE } = mcpHandler(kitMcp);
