// The copy the inbox speaks. English is the only language so far; when another arrives, this picks it per request
// (the user's choice, then Accept-Language) and the components keep importing `t` from here.
import { en, type Copy } from "./en";

export type { Copy };
export const t: Copy = en;
