import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { formPath, personOf, runtime, type Form } from "@/backend";
import { Shell, type Box } from "./Shell";

export const dynamic = "force-dynamic";

// The inbox: everything under here needs a session (proxy.ts lets no request without its cookie through); a cookie
// that no longer stands for a session goes back to the sign-in page.
export default async function InboxLayout({ children }: { children: React.ReactNode }) {
  const rt = runtime();
  const person = await personOf(await headers(), rt);
  if (!person) redirect("/login");
  const counts = rt.store.counts();
  const open = (f: Form) => counts.filter((c) => c.form === f.name && !f.states.find((s) => s.name === c.state)?.closed).reduce((a, c) => a + c.n, 0);
  const boxes = new Map<string, Box>(rt.config.boxes.map((name) => [name, { name, forms: [] }]));
  for (const f of Object.values(rt.config.forms)) boxes.get(f.box)!.forms.push({ name: f.name, title: f.title, path: formPath(f.name), open: open(f) });
  return (
    <Shell boxes={[...boxes.values()]} actor={person.username} canSignOut={!person.id.startsWith("dev:")}>
      {children}
    </Shell>
  );
}
