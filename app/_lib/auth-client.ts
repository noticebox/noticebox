"use client";
// Better Auth's browser client. It holds no token: the session is an HttpOnly cookie. oauthProviderClient carries a
// sign-in page's signed query along with a sign-in, a passkey's included, so an MCP client's authorize step continues after it.
import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { passkeyClient } from "@better-auth/passkey/client";
import { emailOTPClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({ basePath: "/api/auth", plugins: [emailOTPClient(), passkeyClient(), oauthProviderClient()] });
