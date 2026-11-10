// Every language is typed as the English copy (`const de: Copy = { … }`), so a missing or extra key fails the
// typecheck. This checks what the type cannot: that no string is empty and every function gives text.
import { expect, test } from "vitest";
import { en } from "./en";

function leaves(o: unknown, at: string): [string, unknown][] {
  if (typeof o === "object" && o !== null && !Array.isArray(o)) return Object.entries(o).flatMap(([k, v]) => leaves(v, `${at}.${k}`));
  if (Array.isArray(o)) return o.map((v, i) => [`${at}[${i}]`, v]);
  return [[at, o]];
}

test("the English copy has text everywhere", () => {
  for (const [at, v] of leaves(en, "en")) {
    // A sentence split around a name in bold may start or end with nothing; everything else has words.
    const text = typeof v === "function" ? (v as (...a: string[]) => unknown)("x", "y", "z") : v;
    expect(typeof text, at).toBe("string");
    if (!/\[\d\]$/.test(at)) expect((text as string).length, at).toBeGreaterThan(0);
  }
});
