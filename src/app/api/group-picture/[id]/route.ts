import { serveGroupPicture } from "@/features/groups";

export const dynamic = "force-dynamic";

/** GET /api/group-picture/<group id>?px=96|256|512&v=<version>. Members only. See D-036. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return serveGroupPicture(request, id);
}
