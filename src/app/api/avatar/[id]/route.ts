import { serveAvatar } from "@/features/profile";

export const dynamic = "force-dynamic";

/** GET /api/avatar/<user id>?px=96|256|512&v=<version>. See D-026. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return serveAvatar(request, id);
}
