import { createSupabaseServerClient } from "@/lib/supabase/server";

import { REACTION_KINDS, SOCIAL_LIMITS, type ReactionKind, type WallFilter, type WallKind } from "../constants";

/**
 * Reading the wall (CLAUDE.md §7.7, D-077, D-078). The database decides what
 * the viewer may see (their groups only, blocks both ways, closing accounts
 * left out) and counts reactions and comments the same way. Names and photos
 * come from profile_cards, so each person's own privacy settings apply; with
 * no card (they left the group, or their account is gone) the author shows as
 * a former member.
 */

export interface Author {
  /** Null once the account is erased, or when the viewer can no longer see who it was. */
  userId: string | null;
  name: string | null;
  avatarPath: string | null;
}

export interface ReactionCount {
  kind: ReactionKind;
  count: number;
  mine: boolean;
}

export interface WallPost {
  id: string;
  kind: WallKind;
  author: Author;
  body: string;
  badge: string | null;
  pinned: boolean;
  createdAt: string;
  editedAt: string | null;
  commentCount: number;
  reactions: ReactionCount[];
  isMine: boolean;
}

export interface WallComment {
  id: string;
  author: Author;
  body: string;
  createdAt: string;
  editedAt: string | null;
  reactions: ReactionCount[];
  isMine: boolean;
}

export interface WallPage {
  pinned: WallPost[];
  posts: WallPost[];
  /** The id to page from, when there are older posts. */
  nextBefore: string | null;
}

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;

interface RawPost {
  id: string;
  kind: string;
  author_id: string | null;
  body: string | null;
  badge: string | null;
  pinned: boolean;
  created_at: string;
  edited_at: string | null;
  comment_count: number;
  reactions: unknown;
  my_reactions: string[] | null;
  is_mine: boolean;
}

function reactionCounts(raw: unknown, mine: string[] | null): ReactionCount[] {
  const counts = (raw && typeof raw === "object" ? raw : {}) as Record<string, number>;
  const my = new Set(mine ?? []);
  return REACTION_KINDS.map((kind) => ({ kind, count: Number(counts[kind] ?? 0), mine: my.has(kind) }));
}

async function authorsFor(supabase: Client, ids: (string | null)[]): Promise<Map<string, Author>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (!unique.length) return new Map();
  const { data } = await supabase
    .from("profile_cards")
    .select("id, handle, display_name, avatar_path")
    .in("id", unique);
  return new Map(
    (data ?? []).flatMap((c) =>
      c.id ? [[c.id, { userId: c.id, name: c.display_name || c.handle || null, avatarPath: c.avatar_path }]] : [],
    ),
  );
}

const nobody: Author = { userId: null, name: null, avatarPath: null };

function toPost(r: RawPost, authors: Map<string, Author>): WallPost {
  return {
    id: r.id,
    kind: r.kind as WallKind,
    author: (r.author_id && authors.get(r.author_id)) || nobody,
    body: r.body ?? "",
    badge: r.badge,
    pinned: r.pinned,
    createdAt: r.created_at,
    editedAt: r.edited_at,
    commentCount: Number(r.comment_count),
    reactions: reactionCounts(r.reactions, r.my_reactions),
    isMine: r.is_mine,
  };
}

/** One page of a group's wall, plus its pinned announcements on the first page. */
export async function getWall(
  groupId: string,
  filter: WallFilter,
  before: string | null,
  limit?: number,
): Promise<WallPage> {
  const supabase = await createSupabaseServerClient();
  const size = limit ?? SOCIAL_LIMITS.wallPageSize;
  const [pinnedRes, pageRes] = await Promise.all([
    before === null && filter === "all"
      ? supabase.rpc("group_wall", { p_group: groupId, p_kind: "pinned" })
      : Promise.resolve({ data: [] as RawPost[], error: null }),
    supabase.rpc("group_wall", {
      p_group: groupId,
      p_kind: (filter === "all" ? null : filter) as string,
      p_before: before as string,
      p_limit: size + 1,
    }),
  ]);
  if (pinnedRes.error) throw new Error(`wall: ${pinnedRes.error.message}`);
  if (pageRes.error) throw new Error(`wall: ${pageRes.error.message}`);
  const pinned = (pinnedRes.data ?? []) as RawPost[];
  const raw = (pageRes.data ?? []) as RawPost[];
  const page = raw.slice(0, size);
  const authors = await authorsFor(
    supabase,
    [...pinned, ...page].map((p) => p.author_id),
  );
  return {
    pinned: pinned.map((p) => toPost(p, authors)),
    posts: page.map((p) => toPost(p, authors)),
    nextBefore: raw.length > size ? page[page.length - 1]!.id : null,
  };
}

/** One post with its comments, or null when the viewer can't see it (another group, a block, deleted). */
export async function getPostWithComments(
  postId: string,
): Promise<{ groupId: string; post: WallPost; comments: WallComment[] } | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("wall_post", { p_post: postId });
  if (error || !data?.length) return null;
  const row = data[0] as RawPost & { group_id: string };
  const { data: commentRows, error: commentError } = await supabase.rpc("post_comments", { p_post: postId });
  if (commentError) return null;
  const comments = (commentRows ?? []) as {
    id: string;
    author_id: string | null;
    body: string | null;
    created_at: string;
    edited_at: string | null;
    reactions: unknown;
    my_reactions: string[] | null;
    is_mine: boolean;
  }[];
  const authors = await authorsFor(supabase, [row.author_id, ...comments.map((c) => c.author_id)]);
  return {
    groupId: row.group_id,
    post: toPost(row, authors),
    comments: comments.map((c) => ({
      id: c.id,
      author: (c.author_id && authors.get(c.author_id)) || nobody,
      body: c.body ?? "",
      createdAt: c.created_at,
      editedAt: c.edited_at,
      reactions: reactionCounts(c.reactions, c.my_reactions),
      isMine: c.is_mine,
    })),
  };
}

export interface BlockedPerson {
  userId: string;
  name: string;
  blockedAt: string;
}

/** The people I've blocked, with the name they had when I last could see it. */
export async function getBlockedPeople(): Promise<BlockedPerson[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("my_blocked_people");
  if (error) throw new Error(`blocked: ${error.message}`);
  return (data ?? []).map((r) => ({
    userId: r.user_id,
    name: r.display_name || r.handle || "",
    blockedAt: r.blocked_at,
  }));
}

export interface OpenReport {
  id: string;
  targetType: "post" | "comment" | "member";
  targetId: string;
  /** The post, for a post or a comment (to open it, or remove the comment there). */
  postId: string | null;
  subject: Author;
  reason: string;
  note: string | null;
  snapshot: string | null;
  createdAt: string;
  stillThere: boolean;
  reportsOnTarget: number;
}

/** The group's open reports, for its admins (never who reported, never reports about the reader). */
export async function getGroupReports(groupId: string): Promise<OpenReport[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("group_reports", { p_group: groupId });
  if (error) throw new Error(`reports: ${error.message}`);
  const rows = data ?? [];
  const authors = await authorsFor(
    supabase,
    rows.map((r) => r.subject_id),
  );
  return rows.map((r) => ({
    id: r.id,
    targetType: r.target_type as OpenReport["targetType"],
    targetId: r.target_id,
    postId: r.post_id,
    subject: (r.subject_id && authors.get(r.subject_id)) || nobody,
    reason: r.reason,
    note: r.note,
    snapshot: r.snapshot,
    createdAt: r.created_at,
    stillThere: r.still_there,
    reportsOnTarget: Number(r.reports_on_target),
  }));
}
