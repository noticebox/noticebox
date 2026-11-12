// Runs once when the server starts: loads the forms, opens the store and sign-in (a bad configuration stops the start), then
// applies the retention now and every six hours.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { runtime, sweepNow } = await import("@/backend");
  const rt = runtime();
  const ways = [...(rt.signIn.smtp ? ["email"] : []), ...rt.signIn.providers.map((p) => p.id), ...(rt.devUser ? [`dev user ${rt.devUser}`] : [])];
  console.log(`noticebox: ${Object.keys(rt.config.forms).length} form(s); sign-in: ${ways.join(", ")}`);
  await rt.auth(); // opens auth.sqlite and brings Better Auth's tables up to date now, so a broken file stops the start
  sweepNow(rt);
  setInterval(() => sweepNow(rt), 6 * 60 * 60 * 1000).unref();
}
