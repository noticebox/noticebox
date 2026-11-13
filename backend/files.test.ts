// Files on forms: what a post may bring (how many, how large, which kinds), that nothing else gets in, that they are
// only ever served as downloads or sandboxed pictures, that retention takes them with the personal fields, and that
// the API hands them to a token and to nobody else.
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { parseConfig } from "./config";
import { CHUNK_BYTES } from "./db";
import { fileResponse, fileRoute, signedFileUrl } from "./files";
import { intakeRoute } from "./intake";
import { safeName } from "./multipart";
import { restRoute } from "./rest";
import { createApiToken } from "./tokens";
import { BASE, fileConfig, testRuntime, type TestRuntime } from "./testutil";

const DAY = 86400000;

/** A multipart post, encoded up front, so a test that refuses it halfway doesn't cut off an encoder still writing. */
async function post(form: string, fields: Record<string, string>, files: [string, File][] = [], headers: Record<string, string> = {}): Promise<Request> {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  for (const [k, f] of files) fd.append(k, f);
  const encoded = new Response(fd);
  const body = await encoded.arrayBuffer();
  return new Request(`${BASE}/f/${form}`, {
    method: "POST",
    body,
    headers: { "content-type": encoded.headers.get("content-type")!, accept: "application/json", ...headers },
  });
}

const file = (name: string, bytes: number | string, type = "application/octet-stream") =>
  new File([typeof bytes === "string" ? bytes : new Uint8Array(bytes).fill(7)], name, { type });

test("a file field is described with what it accepts, how many and how large; those keys belong to file fields only", () => {
  const order = fileConfig().forms.order!;
  expect(order.fields.model!.files).toEqual({ accept: [".stl", ".3mf", "image/*"], maxFiles: 2, maxBytes: 1024 * 1024 });
  expect(order.fields.model!.personal).toBe(true);
  expect(order.fields.sketch!.files).toEqual({ accept: [], maxFiles: 1, maxBytes: 10 * 1024 * 1024 });
  const form = (field: Record<string, unknown>) => parseConfig({ forms: { f: { kind: "message", fields: { x: field } } } });
  expect(() => form({ type: "text", accept: [".stl"] })).toThrow(/only a file field has accept/);
  expect(() => form({ type: "file", accept: ["stl"] })).toThrow(/neither an extension/);
  expect(() => form({ type: "file", maxFiles: 0 })).toThrow(/maxFiles: a whole number, at least 1/);
  expect(() => form({ type: "file", maxFiles: 1.5 })).toThrow(/maxFiles/);
  expect(() => form({ type: "file", maxMegabytes: 0 })).toThrow(/maxMegabytes: a number more than 0/);
  // Beyond that the limits are the form's: many files, large ones.
  expect(form({ type: "file", maxFiles: 50, maxMegabytes: 5000 }).forms.f!.fields.x!.files).toMatchObject({ maxFiles: 50, maxBytes: 5000 * 1024 * 1024 });
});

test("files arrive with the submission, in order, with their names and sizes", async () => {
  const rt = testRuntime({ config: fileConfig() });
  const res = await intakeRoute(
    await post("order", { name: "Ann" }, [
      ["model", file("C:\\fakepath\\part.STL", 300)],
      ["model", file("photo.jpg", 50, "image/jpeg")],
    ]),
    "order",
    rt,
  );
  expect(res.status).toBe(201);
  const { id } = (await res.json()) as { id: string };
  expect(rt.store.get(id)!.fields).toEqual({ name: "Ann" });
  expect(rt.store.files(id).map(({ field, name, type, size }) => ({ field, name, type, size }))).toEqual([
    { field: "model", name: "part.STL", type: "application/octet-stream", size: 300 },
    { field: "model", name: "photo.jpg", type: "image/jpeg", size: 50 },
  ]);
  // The notification still carries only that something arrived.
  await new Promise((r) => setTimeout(r, 10));
  for (const h of rt.hits) expect(h.body + JSON.stringify(h.headers)).not.toMatch(/part|photo/i);
});

test("too many, too large, the wrong kind, empty, or missing when required: refused by name, and nothing is stored", async () => {
  const rt = testRuntime({ config: fileConfig() });
  const errors = async (files: [string, File][], fields = { name: "Ann" }) => {
    const res = await intakeRoute(await post("order", fields, files), "order", rt);
    expect(res.status).toBe(400);
    return ((await res.json()) as { errors: string[] }).errors;
  };
  expect(await errors([])).toEqual(["Model is required"]);
  expect(
    await errors([
      ["model", file("a.stl", 1)],
      ["model", file("b.stl", 1)],
      ["model", file("c.stl", 1)],
    ]),
  ).toEqual(["Model: at most 2 files"]);
  expect(await errors([["model", file("big.stl", 1024 * 1024 + 1)]])).toEqual(["Model: big.stl is larger than 1 MB"]);
  expect(await errors([["model", file("run.exe", 10)]])).toEqual(["Model: run.exe is not one of the accepted kinds (.stl, .3mf, image/*)"]);
  expect(await errors([["model", file("empty.stl", 0)]])).toEqual(["Model: empty.stl is empty"]);
  expect(rt.store.list()).toHaveLength(0);
  // A JSON post can't carry files, so a required file field refuses it.
  const json = await intakeRoute(
    new Request(`${BASE}/f/order`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Ann" }) }),
    "order",
    rt,
  );
  expect(await json.json()).toEqual({ errors: ["Model is required"] });
});

test("a file under a name that is not a file field is dropped, or refused on a strict form; a bot's files are never kept", async () => {
  const rt = testRuntime({ config: fileConfig() });
  const loose = await intakeRoute(
    await post("order", { name: "Ann" }, [
      ["model", file("a.stl", 5)],
      ["name", file("x.stl", 5)],
      ["other", file("y.stl", 5)],
    ]),
    "order",
    rt,
  );
  const { id } = (await loose.json()) as { id: string };
  expect(rt.store.files(id).map((f) => f.name)).toEqual(["a.stl"]);
  const strict = await intakeRoute(await post("strict", { name: "Ann" }, [["other", file("y.stl", 5)]]), "strict", rt);
  expect(await strict.json()).toEqual({ errors: ["other is not a file field of this form"] });
  const bot = await intakeRoute(await post("order", { name: "Bot", _gotcha: "x" }, [["model", file("a.stl", 5)]]), "order", rt);
  expect(bot.status).toBe(201);
  expect(rt.store.list()).toHaveLength(1);
});

test("a post may be as large as the form's file fields allow, and no larger", async () => {
  const rt = testRuntime({ config: fileConfig() });
  // Text-only forms keep the small limit; this one allows two models and a sketch on top of it.
  const big = await intakeRoute(await post("strict", { name: "x".repeat(70 * 1024) }), "strict", rt);
  expect(big.status).toBe(413);
  const ok = await intakeRoute(
    await post("order", { name: "Ann" }, [
      ["model", file("a.stl", 900 * 1024)],
      ["model", file("b.stl", 900 * 1024)],
    ]),
    "order",
    rt,
  );
  expect(ok.status).toBe(201);
});

test("a file's own name is kept without a path, control characters or quotes", () => {
  expect(safeName("C:\\Users\\ann\\part.stl")).toBe("part.stl");
  expect(safeName("../../etc/passwd")).toBe("passwd");
  expect(safeName('a"b\u0000c.stl')).toBe("abc.stl");
  expect(safeName("..")).toBe("file");
  expect(safeName("")).toBe("file");
});

test("a file is served as a download; only a common photo format is shown, sandboxed, and never an SVG", () => {
  const rt = testRuntime({ config: fileConfig() });
  const s = rt.store.receive(rt.config.forms.order!, { name: "Ann" }, null, new Date(), [
    { field: "model", name: "photo.png", type: "image/png", data: new Uint8Array([1]) },
    { field: "model", name: "draw.svg", type: "image/svg+xml", data: new TextEncoder().encode("<svg onload=alert(1)>") },
  ]);
  const [png, svg] = rt.store.files(s.id);
  const dl = fileResponse(rt, png!.id)!;
  expect(dl.headers.get("content-type")).toBe("application/octet-stream");
  expect(dl.headers.get("content-disposition")).toBe(`attachment; filename="photo.png"; filename*=UTF-8''photo.png`);
  expect(dl.headers.get("x-content-type-options")).toBe("nosniff");
  const shown = fileResponse(rt, png!.id, { inline: true })!;
  expect(shown.headers.get("content-type")).toBe("image/png");
  expect(shown.headers.get("content-disposition")).toMatch(/^inline;/);
  expect(shown.headers.get("content-security-policy")).toContain("sandbox");
  const notShown = fileResponse(rt, svg!.id, { inline: true })!;
  expect(notShown.headers.get("content-type")).toBe("application/octet-stream");
  expect(notShown.headers.get("content-disposition")).toMatch(/^attachment;/);
  expect(fileResponse(rt, png!.id, { submissionId: "another" })).toBeNull();
  expect(fileResponse(rt, "nope")).toBeNull();
});

test("retention removes personal files with the personal fields, keeps the others, and deletes all with the submission", () => {
  const rt = testRuntime({ config: fileConfig() });
  const form = rt.config.forms.order!;
  const s = rt.store.receive(form, { name: "Ann" }, null, new Date(0), [
    { field: "model", name: "part.stl", type: "model/stl", data: new Uint8Array([1]) },
    { field: "sketch", name: "sketch.png", type: "image/png", data: new Uint8Array([2]) },
  ]);
  expect(rt.store.transition(form, s.id, "me", "answered", "", new Date(0)).ok).toBe(true);
  expect(rt.store.sweep(rt.config, new Date(31 * DAY))).toBe(1);
  expect(rt.store.files(s.id).map((f) => f.name)).toEqual(["sketch.png"]);
  expect(rt.store.expire(rt.config, new Date(61 * DAY))).toBe(1);
  expect(rt.store.get(s.id)).toBeUndefined();
  expect(rt.store.files(s.id)).toEqual([]);
});

async function token(rt: TestRuntime): Promise<string> {
  const ctx = await (await rt.auth()).$context;
  const now = new Date();
  const u = await (ctx.adapter as unknown as { create(q: { model: string; data: Record<string, unknown> }): Promise<{ id: unknown }> }).create({
    model: "user",
    data: { email: "marcel@test.example", name: "marcel", emailVerified: true, createdAt: now, updatedAt: now },
  });
  const t = await createApiToken(rt, String(u.id), { name: "script", scope: "read" });
  if ("error" in t) throw new Error(t.error);
  return t.token;
}

test("the API lists a submission's files and hands one to a token, as a download, only under its own submission", async () => {
  const rt = testRuntime({ config: fileConfig() });
  const s = rt.store.receive(rt.config.forms.order!, { name: "Ann" }, null, new Date(), [
    { field: "model", name: "part.stl", type: "model/stl", data: new TextEncoder().encode("solid") },
  ]);
  const key = await token(rt);
  const get = (path: string, auth: string | null = key) =>
    restRoute(new Request(`${BASE}/api/v1${path}`, { headers: auth ? { authorization: `Bearer ${auth}` } : {} }), rt, path.slice(1).split("/"));
  const sub = (await (await get(`/submissions/${s.id}`)).json()) as { files: { id: string; api_url: string; url: string }[] };
  const f = sub.files[0]!;
  expect(f.url).toBe(`${BASE}/files/${f.id}`);
  expect(f.api_url).toBe(`${BASE}/api/v1/submissions/${s.id}/files/${f.id}`);
  const dl = await get(`/submissions/${s.id}/files/${f.id}`);
  expect(dl.status).toBe(200);
  expect(dl.headers.get("content-disposition")).toMatch(/^attachment; filename="part.stl"/);
  expect(await dl.text()).toBe("solid");
  expect((await get(`/submissions/other/files/${f.id}`)).status).toBe(404);
  expect((await get(`/submissions/${s.id}/files/${f.id}`, null)).status).toBe(401);
});

/** A folder of its own for a test's uploads, to see that nothing is left in it. */
const uploads = () => mkdtempSync(join(tmpdir(), "noticebox-test-"));

test("a file too large is cut off as it arrives: the rest of the post is never read, and nothing is left behind", async () => {
  const dir = uploads();
  const rt = testRuntime({ config: fileConfig(), uploadDir: dir });
  const boundary = "----noticebox";
  const head = new TextEncoder().encode(
    `--${boundary}\r\ncontent-disposition: form-data; name="name"\r\n\r\nAnn\r\n--${boundary}\r\ncontent-disposition: form-data; name="model"; filename="huge.stl"\r\ncontent-type: application/octet-stream\r\n\r\n`,
  );
  let sent = 0;
  // A body that never ends: if the intake read it all, the test would time out.
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(head);
    },
    pull(c) {
      sent += 64 * 1024;
      c.enqueue(new Uint8Array(64 * 1024).fill(7));
    },
  });
  const res = await intakeRoute(
    new Request(`${BASE}/f/order`, {
      method: "POST",
      body,
      headers: { "content-type": `multipart/form-data; boundary=${boundary}`, accept: "application/json" },
      duplex: "half",
    } as RequestInit),
    "order",
    rt,
  );
  expect(res.status).toBe(400);
  expect(((await res.json()) as { errors: string[] }).errors).toEqual(["Model: huge.stl is larger than 1 MB"]);
  expect(sent).toBeLessThan(2 * 1024 * 1024);
  expect(rt.store.list()).toHaveLength(0);
  expect(readdirSync(dir)).toEqual([]);
});

test("a file of several chunks comes back byte for byte, and its temporary copy is gone", async () => {
  const dir = uploads();
  const rt = testRuntime({ config: fileConfig(), uploadDir: dir });
  const bytes = new Uint8Array(2 * CHUNK_BYTES + 12345).map((_, i) => (i * 31) % 251);
  const res = await intakeRoute(
    await post("order", { name: "Ann" }, [
      ["model", file("a.stl", 10)],
      ["sketch", new File([bytes], "scan.pdf", { type: "application/pdf" })],
    ]),
    "order",
    rt,
  );
  expect(res.status).toBe(201);
  expect(readdirSync(dir)).toEqual([]);
  const { id } = (await res.json()) as { id: string };
  const scan = rt.store.files(id).find((f) => f.name === "scan.pdf")!;
  expect(scan.size).toBe(bytes.byteLength);
  expect(rt.store.chunk(scan.id, 2)!.byteLength).toBe(12345);
  const back = new Uint8Array(await fileResponse(rt, scan.id)!.arrayBuffer());
  expect(Buffer.compare(back, bytes)).toBe(0);
});

test("a signed link downloads a file without signing in, until it runs out; a changed one never does", async () => {
  let now = new Date("2026-11-13T10:00:00Z");
  const rt = testRuntime({ config: fileConfig(), now: () => now });
  const s = rt.store.receive(rt.config.forms.order!, { name: "Ann" }, null, now, [
    { field: "model", name: "part.stl", type: "model/stl", data: new TextEncoder().encode("solid") },
  ]);
  const f = rt.store.files(s.id)[0]!;
  const link = signedFileUrl(rt, BASE, f.id);
  expect(link.expires_at).toBe("2026-11-13T10:15:00.000Z");
  const get = (url: string) => fileRoute(new Request(url), rt, f.id);
  const ok = await get(link.url);
  expect(ok.status).toBe(200);
  expect(await ok.text()).toBe("solid");
  expect((await get(link.url.replace(/sig=./, "sig=x"))).status).toBe(403);
  expect((await get(link.url.replace(/exp=\d+/, (m) => `exp=${Number(m.slice(4)) + 3600}`))).status).toBe(403);
  expect((await fileRoute(new Request(link.url), rt, "another")).status).toBe(403);
  expect((await get(`${BASE}/files/${f.id}`)).status).toBe(401);
  now = new Date("2026-11-13T10:16:00Z");
  expect((await get(link.url)).status).toBe(403);
});

test("a file input left empty sends a part without a name or bytes: no file, on any field, whatever it accepts", async () => {
  const rt = testRuntime({ config: fileConfig() });
  // `sketch` is optional; an empty part under `model` (which accepts .stl and images only) must not count either.
  const res = await intakeRoute(
    await post("order", { name: "Ann" }, [
      ["model", file("a.stl", 5)],
      ["model", new File([], "", { type: "application/octet-stream" })],
      ["sketch", new File([], "", { type: "application/octet-stream" })],
    ]),
    "order",
    rt,
  );
  expect(res.status).toBe(201);
  const { id } = (await res.json()) as { id: string };
  expect(rt.store.files(id).map((f) => f.name)).toEqual(["a.stl"]);
});
