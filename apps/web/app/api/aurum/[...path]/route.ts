import { forwardAurumRequest } from '../../../../lib/api/bff';

type RouteContext = {
  params: Promise<{ path: string[] }> | { path: string[] };
};

async function handle(request: Request, context: RouteContext) {
  const params = await context.params;
  if (
    !Array.isArray(params.path) ||
    params.path.some((segment) => !/^[A-Za-z0-9_-]+$/.test(segment))
  ) {
    return Response.json({ error: { code: 'not_found' } }, { status: 404 });
  }
  return forwardAurumRequest(
    request,
    `/${params.path.join('/')}`,
    process.env.AURUM_API_URL ?? '',
  );
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
