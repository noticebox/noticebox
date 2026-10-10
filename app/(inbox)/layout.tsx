import { headers } from "next/headers";
import { formPath, KINDS, runtime, type Form } from "@/backend";
import { Shell, type Box } from "./Shell";

export const dynamic = "force-dynamic";

// The inbox: everything under here is behind the login proxy (proxy.ts), and the header says who is signed in.
export default async function InboxLayout({ children }: { children: React.ReactNode }) {
  const rt = runtime();
  const actor = (await headers()).get(rt.userHeader) ?? rt.devUser ?? "";
  const counts = rt.store.counts();
  const open = (f: Form) => counts.filter((c) => c.form === f.name && !KINDS[f.kind].closed.includes(c.state)).reduce((a, c) => a + c.n, 0);
  const boxes = new Map<string, Box>();
  for (const f of Object.values(rt.config.forms)) {
    const box = boxes.get(f.box) ?? { name: f.box, forms: [] };
    box.forms.push({ name: f.name, title: f.title, path: formPath(f.name), open: open(f) });
    boxes.set(f.box, box);
  }
  return (
    <Shell boxes={[...boxes.values()]} actor={actor}>
      {children}
    </Shell>
  );
}
