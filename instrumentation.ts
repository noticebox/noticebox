// Runs once when the server starts: loads the forms and opens the store (a bad configuration stops the start), then
// applies the retention now and every six hours.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { runtime, sweepNow } = await import("@/backend");
  const rt = runtime();
  console.log(`noticebox: ${Object.keys(rt.config.forms).length} form(s)${rt.secret ? ", MCP on" : ", MCP off (no NOTICEBOX_SECRET)"}`);
  sweepNow(rt);
  setInterval(() => sweepNow(rt), 6 * 60 * 60 * 1000).unref();
}
