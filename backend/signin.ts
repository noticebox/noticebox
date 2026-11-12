// The route handlers of sign-in, thin over Better Auth (accounts.ts): everything under /api/auth, the OAuth metadata
// it can't serve from under its own base path, and what the sign-in and consent pages need to know.
import { oauthProviderAuthServerMetadata, oauthProviderOpenIdConfigMetadata } from "@better-auth/oauth-provider";
import type { Runtime } from "./runtime";

/** Everything under /api/auth, and the protected-resource metadata of /mcp: Better Auth answers. */
export const authRoute = async (req: Request, rt: Runtime): Promise<Response> => (await rt.auth()).handler(req);

/** /.well-known/oauth-authorization-server/api/auth (RFC 8414), which Better Auth can't serve from under its base path. */
export const authServerMetadataRoute = async (req: Request, rt: Runtime): Promise<Response> => oauthProviderAuthServerMetadata(await rt.auth())(req);

/** /.well-known/openid-configuration/api/auth, likewise. */
export const openIdConfigRoute = async (req: Request, rt: Runtime): Promise<Response> => oauthProviderOpenIdConfigMetadata(await rt.auth())(req);

/** The name of the OAuth client a consent page asks about; null when it isn't known. */
export async function clientNameFor(headers: Headers, clientId: string, rt: Runtime): Promise<string | null> {
  try {
    const c = (await (await rt.auth()).api.getOAuthClientPublic({ query: { client_id: clientId }, headers })) as { client_name?: string } | null;
    return c?.client_name || null;
  } catch {
    return null;
  }
}

export type RefusedSignIn = { provider: string | null; code: string };

const CODE = /^[a-z][a-z0-9_.-]{0,63}$/i;

/**
 * A refused sign-in says why: Better Auth sends the provider's OAuth error (or its own, such as an address not on the
 * list) back to the sign-in page as `?error=`, with the `provider` the page put in its errorCallbackURL. The page shows
 * the code and the log has one line. The query is anyone's to write, so only a known provider and an OAuth-shaped code
 * get through, and `error_description` is never shown or logged.
 */
export function refusedSignIn(query: { error?: string | string[]; provider?: string | string[] }, rt: Runtime): RefusedSignIn | null {
  const code = typeof query.error === "string" ? query.error : undefined;
  if (!code) return null;
  const known = typeof query.provider === "string" ? rt.signIn.providers.find((p) => p.id === query.provider) : undefined;
  const safe = CODE.test(code) ? code : "unknown_error";
  rt.log(`sign-in: refused (${known?.id ?? "email"}): ${safe}`);
  return { provider: known?.label ?? null, code: safe };
}
