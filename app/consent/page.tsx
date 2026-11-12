import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { clientNameFor, personOf, runtime } from "@/backend";
import { t } from "@/app/_lib/copy";
import { ConsentForm } from "./ConsentForm";

export const dynamic = "force-dynamic";

// The OAuth step of an MCP client: Better Auth sends the signed-in person here with the client and its scopes in a
// signed query; ConsentForm answers it, and the client gets its code.
export default async function ConsentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const rt = runtime();
  const h = await headers();
  const query = await searchParams;
  const person = await personOf(h, rt);
  if (!person) redirect("/login");
  const clientId = typeof query.client_id === "string" ? query.client_id : "";
  const name = (clientId && (await clientNameFor(h, clientId, rt))) || t.consent.unknownClient;
  return (
    <main className="mx-auto mt-[18vh] max-w-md px-4">
      <div className="card p-6">
        <h1 className="mb-2 text-xl font-bold tracking-tight">{t.consent.title}</h1>
        <p className="mb-1">
          {t.consent.wants[0]}
          <strong>{name}</strong>
          {t.consent.wants[1]}
          <strong>{person.email}</strong>
          {t.consent.wants[2]}
        </p>
        <p className="mb-6 text-sm text-muted">{t.consent.recorded}</p>
        <ConsentForm />
      </div>
    </main>
  );
}
