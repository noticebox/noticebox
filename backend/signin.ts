// What the sign-in and consent pages ask about sign-in, over next-app-kit/signin: the name of the client a consent page
// asks about, and why a sign-in was refused. The routes themselves are the kit's (next-app-kit/next).
import { clientNameFor as kitClientNameFor, refusedSignIn as kitRefusedSignIn, type RefusedSignIn } from "next-app-kit/signin";
import type { Runtime } from "./runtime";

export type { RefusedSignIn };

/** The name of the OAuth client a consent page asks about; null when it isn't known. */
export const clientNameFor = async (headers: Headers, clientId: string, rt: Runtime): Promise<string | null> =>
  kitClientNameFor(headers, clientId, await rt.auth());

/** Why the sign-in page was sent a refused sign-in: a known provider and an OAuth-shaped code, or null. */
export const refusedSignIn = (query: { error?: string | string[]; provider?: string | string[] }, rt: Runtime): RefusedSignIn | null =>
  kitRefusedSignIn(query, rt.signIn);
