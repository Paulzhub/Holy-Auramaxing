import type { ExportPart, ExportRow } from "@/lib/data-export";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The social module's part of "Download my data" (D-032, D-077): the person's
 * own posts, comments and reactions, the people they blocked (ids only) and
 * the reports they made. Never anything anyone else wrote, and never who
 * reported them.
 */
export async function exportSocialData(): Promise<ExportPart> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("my_social_export");
  if (error) throw new Error(`social export: ${error.message}`);
  // Every value is a string, number, boolean or null (the function builds plain JSON).
  const all = (data ?? {}) as Record<string, ExportRow[]>;
  const rows = (key: string): ExportRow[] => (Array.isArray(all[key]) ? all[key] : []);
  return {
    sections: [
      {
        name: "wall_posts",
        description: "What you wrote on your groups' walls. Deleted posts are listed without their text.",
        rows: rows("posts"),
      },
      {
        name: "wall_comments",
        description: "Your comments on posts. Deleted comments are listed without their text.",
        rows: rows("comments"),
      },
      {
        name: "reactions",
        description: "The reactions you gave to posts and comments.",
        rows: rows("reactions"),
      },
      {
        name: "blocked_people",
        description: "The people you blocked (account ids only).",
        rows: rows("blocks"),
      },
      {
        name: "reports_made",
        description: "What you reported to a group's admins, and whether it was resolved.",
        rows: rows("reports"),
      },
    ],
    files: [],
  };
}
