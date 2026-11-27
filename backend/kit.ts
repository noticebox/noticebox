// What next-app-kit's route handlers (next-app-kit/next) are given: getters for this process's Better Auth, MCP
// context and REST app, asked at the first request, so `next build` opens no database. The route files under app/
// are one line each over these.
import { mcpContext } from "./mcp";
import { restApp } from "./rest";
import { runtime } from "./runtime";

export const kitAuth = () => runtime().auth();
export const kitMcp = () => mcpContext(runtime());
export const kitRest = () => restApp(runtime());
