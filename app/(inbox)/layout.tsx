import { headers } from "next/headers";
import { formPath, runtime, type Form } from "@/backend";
import { Shell, type Box } from "./Shell";

export const dynamic = "force-dynamic";

// The inbox: everything under here is behind the login proxy (proxy.ts), and the header says who is signed in.
export default async function InboxLayout({ children }: { children: React.ReactNode }) {
  const rt = runtime();
  const actor = (await headers()).get(rt.userHeader) ?? rt.devUser ?? "";
  const counts = rt.store.counts();
  const open = (f: Form) => counts.filter((c) => c.form === f.name && !f.states.find((s) => s.name === c.state)?.closed).reduce((a, c) => a + c.n, 0);
  const boxes = new Map<string, Box>(rt.config.boxes.map((name) => [name, { name, forms: [] }]));
  for (const f of Object.values(rt.config.forms)) boxes.get(f.box)!.forms.push({ name: f.name, title: f.title, path: formPath(f.name), open: open(f) });
  return (
    <Shell boxes={[...boxes.values()]} actor={actor} signOutUrl={rt.signOutUrl}>
      {children}
    </Shell>
  );
}
