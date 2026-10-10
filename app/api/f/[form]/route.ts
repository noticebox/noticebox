import { intakePreflight, intakeRoute, runtime } from "@/backend";

type Ctx = { params: Promise<{ form: string }> };

export async function POST(req: Request, { params }: Ctx): Promise<Response> {
  const { form } = await params;
  return intakeRoute(req, form, runtime());
}

export async function OPTIONS(req: Request, { params }: Ctx): Promise<Response> {
  const { form } = await params;
  return intakePreflight(form, req.headers, runtime());
}
