import { llmsText } from "@/features/marketing/llms";

/** /llms.txt (CLAUDE.md §12 GEO): a plain summary of the site for AI tools. */
export const dynamic = "force-static";

export function GET() {
  return new Response(llmsText(), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
