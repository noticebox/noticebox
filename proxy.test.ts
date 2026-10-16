import { expect, test } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

const post = (path: string) => proxy(new NextRequest(new URL(path, "http://localhost"), { method: "POST" }));

test("a form's POST is rewritten to its route handler, also when the name starts with a digit", () => {
  for (const name of ["contact", "3dbruckner-order"]) {
    expect(post(`/f/${name}`).headers.get("x-middleware-rewrite")).toBe(`http://localhost/api/f/${name}`);
  }
});

test("a name that starts with - is not a form", () => {
  expect(post("/f/-x").headers.get("x-middleware-rewrite")).toBeNull();
});
