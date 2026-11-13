import { expect, test } from "@playwright/test";
import { signedFileUrl } from "../backend/files";
import type { Runtime } from "../backend/runtime";
import { E2E_ENV } from "./seed";

// A page posts a model and a photo with its form; the inbox shows the photo, offers both as downloads, and the
// download is a download, not a page.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

test("files posted with a form are kept, shown as a picture or offered as a download", async ({ page, request }) => {
  const refused = await request.post("/f/order", {
    multipart: { name: "Ann", model: { name: "run.exe", mimeType: "application/octet-stream", buffer: Buffer.from("MZ") } },
    headers: { accept: "application/json" },
  });
  expect(refused.status()).toBe(400);
  expect(await refused.json()).toEqual({ errors: ["Model: run.exe is not one of the accepted kinds (.stl, image/*)"] });

  const sent = await request.post("/f/order", {
    multipart: { name: "Ann", model: { name: "part.stl", mimeType: "model/stl", buffer: Buffer.from("solid part\nendsolid part\n") } },
    headers: { accept: "application/json" },
  });
  expect(sent.status()).toBe(201);
  const { id } = (await sent.json()) as { id: string };

  // Two files in one field: the browser's way, one input with `multiple`.
  const two = await request.fetch("/f/order", {
    method: "POST",
    multipart: (() => {
      const fd = new FormData();
      fd.append("name", "Bob");
      fd.append("model", new Blob([PNG], { type: "image/png" }), "photo.png");
      fd.append("model", new Blob(["solid x"], { type: "model/stl" }), "x.stl");
      return fd;
    })(),
    headers: { accept: "application/json" },
  });
  expect(two.status()).toBe(201);
  const both = ((await two.json()) as { id: string }).id;

  await page.goto(`/forms/order/case/${both}`);
  await expect(page.getByRole("heading", { name: "Files" })).toBeVisible();
  await expect(page.getByRole("img", { name: "photo.png" })).toBeVisible();
  const link = page.getByRole("link", { name: "Download x.stl" });
  await expect(link).toBeVisible();
  const href = (await link.getAttribute("href"))!;
  const file = await page.request.get(href);
  expect(file.status()).toBe(200);
  expect(file.headers()["content-type"]).toBe("application/octet-stream");
  expect(file.headers()["content-disposition"]).toMatch(/^attachment; filename="x.stl"/);
  expect(await file.text()).toBe("solid x");

  await page.goto(`/forms/order/case/${id}`);
  await expect(page.getByRole("link", { name: "Download part.stl" })).toBeVisible();
  // Without a session, no file.
  const anonymous = await page.context().browser()!.newContext({ storageState: undefined });
  expect((await anonymous.request.get(href)).status()).toBe(401);
  // A signed link (what MCP get_file hands out) works without a session, through the proxy; a changed one doesn't.
  const fileId = href.split("/").pop()!.split("?")[0]!;
  const signer = { now: () => new Date(), signIn: { secret: E2E_ENV.NOTICEBOX_SECRET } } as unknown as Runtime;
  const { url } = signedFileUrl(signer, "", fileId);
  const signed = await anonymous.request.get(url);
  expect(signed.status()).toBe(200);
  expect(await signed.text()).toBe("solid x");
  expect((await anonymous.request.get(url.replace(/sig=./, "sig=x"))).status()).toBe(403);
  await anonymous.close();
});
