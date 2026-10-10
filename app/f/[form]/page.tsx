import { notFound } from "next/navigation";
import { runtime, type Field } from "@/backend";

export const dynamic = "force-dynamic";

type Query = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? "") : (v ?? ""));
const all = (v: string | string[] | undefined): string[] => (Array.isArray(v) ? v : v === undefined ? [] : [v]);

function Input({ name, f, value }: { name: string; f: Field; value: string }) {
  const id = `f_${name}`;
  const readOnly = Boolean(value) && f.prefill;
  const common = { id, name, required: f.required, readOnly, className: "field read-only:text-muted" };
  if (f.type === "textarea") return <textarea {...common} rows={6} maxLength={f.max} defaultValue={value} />;
  if (f.type === "select")
    return (
      <select {...common} defaultValue={value}>
        <option value="">Choose</option>
        {f.options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    );
  return <input {...common} type={f.type === "email" ? "email" : "text"} maxLength={f.max} defaultValue={value} />;
}

// The hosted form: fields from the configuration, ids taken from the link, and what was typed brought back with
// the errors when a submission was refused. It posts to its own path; proxy.ts hands the POST to the endpoint.
export default async function FormPage({ params, searchParams }: { params: Promise<{ form: string }>; searchParams: Promise<Query> }) {
  const { form: name } = await params;
  const form = runtime().config.forms[name];
  if (!form) notFound();
  const q = await searchParams;
  const errors = all(q.error);
  const valueOf = (fname: string, f: Field) => (f.prefill || errors.length ? one(q[fname]).slice(0, f.max) : "");
  return (
    <main className="mx-auto max-w-xl">
      <h1 className="mb-2 text-xl font-bold tracking-tight">{form.title}</h1>
      {form.intro && <p className="mb-4 text-muted">{form.intro}</p>}
      {errors.length > 0 && (
        <ul role="alert" className="mb-4 list-disc pl-5 text-error">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <form method="post" action={`/f/${form.name}`}>
        {Object.entries(form.fields).map(([fname, f]) =>
          f.type === "hidden" ? (
            <input key={fname} type="hidden" name={fname} value={valueOf(fname, f)} />
          ) : (
            <div key={fname} className="mb-4">
              <label htmlFor={`f_${fname}`} className="mb-1 block text-sm font-semibold">
                {f.label}
                {f.required && " *"}
              </label>
              <Input name={fname} f={f} value={valueOf(fname, f)} />
              {f.help && <p className="mt-1 text-sm text-muted">{f.help}</p>}
            </div>
          ),
        )}
        <div className="gotcha" aria-hidden="true">
          <label>
            Leave this field empty <input type="text" name="_gotcha" tabIndex={-1} autoComplete="off" />
          </label>
        </div>
        <button type="submit" className="rounded-sm bg-accent px-4 py-1.5 font-bold text-on-accent">
          Send
        </button>
      </form>
    </main>
  );
}
