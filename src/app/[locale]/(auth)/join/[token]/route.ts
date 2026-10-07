import { handleInviteLink } from "@/features/groups";

export const dynamic = "force-dynamic";

/**
 * GET /join/<token>: an invite link or QR code. Keeps the invite (as a
 * hash, in an httpOnly cookie) and redirects to /join, so the token never
 * lingers in the address bar or history (D-037).
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return handleInviteLink(request, token);
}
