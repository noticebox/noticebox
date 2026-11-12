import { refusedSignIn, runtime, safeNext, signInMethods } from "@/backend";
import { t } from "@/app/_lib/copy";
import { SignIn } from "./SignIn";

export const dynamic = "force-dynamic";

// The sign-in page: a code by email, and a button per provider. An MCP client's authorize step sends the browser here
// with a signed query (`sig`); the browser client carries it along, so the authorization goes on after the sign-in.
export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const rt = runtime();
  const forAssistant = typeof query.sig === "string";
  return (
    <main className="mx-auto mt-[14vh] max-w-md px-4">
      <div className="card p-6">
        <h1 className="mb-1 text-xl font-bold tracking-tight">noticebox</h1>
        <p className="mb-6 text-muted">{forAssistant ? t.signIn.forAssistant : t.signIn.intro}</p>
        <SignIn methods={signInMethods(rt.signIn)} next={safeNext(query.next)} refused={refusedSignIn(query, rt)} />
      </div>
    </main>
  );
}
