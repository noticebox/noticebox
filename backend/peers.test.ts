// next-app-kit's peers (Better Auth and its plugins, the MCP SDK, better-sqlite3, kysely, zod, nodemailer, Next.js)
// are installed at exactly the kit's versions, so one copy of each runs; npm's refusal is the guard, and this checks it held.
import { checkPeers } from "next-app-kit/testing";
import { test } from "vitest";

test("next-app-kit's peers are at its versions", () => checkPeers());
