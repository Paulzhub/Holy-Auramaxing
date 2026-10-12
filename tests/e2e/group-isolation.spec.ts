import { expect } from "@playwright/test";

import { signedOut, test } from "./fixtures";
import { apiAs, createGroupAs, createInviteAs, joinAs, newMember } from "./support/groups";
import { signInNewMember } from "./support/session";

// Phase 3 "done when": a member of group A gets zero rows from group B on
// every table and endpoint, and an admin cannot act on another group even
// by calling the API directly (CLAUDE.md §2.4, §7.4). The database half is
// proven table by table in supabase/tests/database/022_groups_isolation.

test.describe("Group isolation", () => {
  test.use({ storageState: signedOut });

  test("an admin of group A sees nothing of group B and can't act on it", async ({ page, request }) => {
    // Group B, with a member, an invite, a picture-less cover and an open covenant change.
    const bOwner = await newMember("iso-b-owner");
    const groupB = await createGroupAs(bOwner, "Group B");
    const { token: tokenB, inviteId: inviteB } = await createInviteAs(bOwner, groupB);
    const bMember = await newMember("iso-b-member");
    await joinAs(bMember, tokenB);
    const { data: outcome } = await bOwner.client.rpc("change_group_covenant", {
      p_group: groupB,
      p_covenant_text: "A stricter covenant for B.",
      p_min_share_level: "full",
      p_leaderboard_hiding_allowed: false,
    });
    expect(outcome).toBe("proposed");
    // Phase 6a: a post on B's wall.
    const { data: postB, error: postError } = await bMember.client.rpc("create_post", {
      p_group: groupB,
      p_kind: "prayer_request",
      p_body: "Only group B should read this.",
    });
    expect(postError).toBeNull();

    // Me: the owner of group A, signed in through the browser too.
    const me = await apiAs(await signInNewMember(page, "iso-a-owner"));
    const groupA = await createGroupAs(me, "Group A");

    // ---- pages: every group page of B is a 404, like a group that doesn't exist
    for (const path of [
      "",
      "/wall",
      `/wall/${postB}`,
      "/partner",
      "/leaderboard",
      "/members",
      "/invites",
      `/invites/${inviteB}`,
      "/moderation",
      "/settings",
    ]) {
      const response = await page.goto(`/groups/${groupB}${path}`);
      expect(response?.status(), `/groups/B${path}`).toBe(404);
      await expect(page.getByText("Group B")).toHaveCount(0);
    }
    expect((await page.goto(`/groups/${groupA}`))?.status()).toBe(200);
    // B's invite through A's own page (D-076), and B's post through A's wall (D-077).
    expect((await page.goto(`/groups/${groupA}/invites/${inviteB}`))?.status()).toBe(404);
    expect((await page.goto(`/groups/${groupA}/wall/${postB}`))?.status()).toBe(404);

    // ---- endpoints: B's picture route
    const picture = await page.request.get(`/api/group-picture/${groupB}?px=96`);
    expect(picture.status()).toBe(404);
    expect((await request.get(`/api/group-picture/${groupB}?px=96`)).status()).toBe(401);

    // ---- the API, directly: zero rows of B from every group table
    for (const [table, column] of [
      ["groups", "id"],
      ["group_members", "group_id"],
      ["group_invites", "group_id"],
      ["group_covenant_proposals", "group_id"],
      ["group_covenant_agreements", "group_id"],
      ["leaderboard_entries", "group_id"],
      ["group_goals", "group_id"],
      ["posts", "group_id"],
      ["comments", "group_id"],
      ["reactions", "group_id"],
      ["reports", "group_id"],
      ["nudges", "group_id"],
      ["partnerships", "group_id"],
    ] as const) {
      const { data, error } = await me.client.from(table).select(column).eq(column, groupB);
      expect(error, table).toBeNull();
      expect(data, table).toEqual([]);
    }
    const { data: cards } = await me.client
      .from("profile_cards")
      .select("id")
      .in("id", [bOwner.userId, bMember.userId]);
    expect(cards).toEqual([]);

    // ---- the API, directly: every group function aimed at B is refused
    const { data: proposal } = await bOwner.client
      .from("group_covenant_proposals")
      .select("id")
      .eq("group_id", groupB)
      .single();
    const calls: [string, Record<string, unknown>][] = [
      ["update_group_details", { p_group: groupB, p_name: "Taken", p_description: "" }],
      [
        "update_group_challenge",
        {
          p_group: groupB,
          p_challenge_type: "30",
          p_challenge_days: null,
          p_start_date: new Date().toISOString().slice(0, 10),
          p_timezone: "UTC",
          p_max_members: 50,
          p_join_policy: "invite_only",
        },
      ],
      [
        "change_group_covenant",
        {
          p_group: groupB,
          p_covenant_text: "Overwritten covenant.",
          p_min_share_level: "checkin_only",
          p_leaderboard_hiding_allowed: true,
        },
      ],
      ["agree_to_covenant_change", { p_proposal: proposal!.id }],
      ["decline_covenant_change", { p_proposal: proposal!.id }],
      ["withdraw_covenant_change", { p_proposal: proposal!.id }],
      ["archive_group", { p_group: groupB }],
      ["delete_group", { p_group: groupB, p_confirm_name: "Group B" }],
      ["transfer_group_ownership", { p_group: groupB, p_new_owner: me.userId }],
      ["set_group_member_role", { p_group: groupB, p_user: bMember.userId, p_role: "admin" }],
      ["remove_group_member", { p_group: groupB, p_user: bMember.userId }],
      ["approve_join_request", { p_group: groupB, p_user: bMember.userId }],
      [
        "create_group_invite",
        {
          p_group: groupB,
          p_token_hash: "a".repeat(64),
          p_code_hash: "b".repeat(64),
          p_expires_in_days: 7,
          p_max_uses: null,
        },
      ],
      ["revoke_group_invite", { p_invite: inviteB }],
      ["set_group_picture_pending", { p_group: groupB, p_path: `${groupB}/aaaaaaaaaaaaaaaaaaaaaa` }],
      ["remove_group_picture", { p_group: groupB }],
      ["update_my_group_membership", { p_group: groupB, p_share_level: "full", p_leaderboard_hidden: false }],
      ["leave_group", { p_group: groupB }],
      // Phase 5c (D-074 to D-076).
      ["group_leaderboard", { p_group: groupB }],
      ["group_together", { p_group: groupB }],
      ["set_group_goal", { p_group: groupB, p_period: "month", p_target: 10 }],
      ["end_group_goal", { p_group: groupB }],
      ["group_invite_people", { p_invite: inviteB }],
      // Phase 6a (D-077 to D-079).
      ["group_wall", { p_group: groupB }],
      ["wall_post", { p_post: postB }],
      ["post_comments", { p_post: postB }],
      ["create_post", { p_group: groupB, p_kind: "encouragement", p_body: "Hello B" }],
      ["edit_post", { p_post: postB, p_body: "Changed" }],
      ["delete_post", { p_post: postB }],
      ["create_comment", { p_post: postB, p_body: "Hi" }],
      ["set_reaction", { p_target_type: "post", p_target: postB, p_kind: "pray", p_on: true }],
      ["report_content", { p_group: groupB, p_target_type: "post", p_target: postB, p_reason: "spam" }],
      ["group_reports", { p_group: groupB }],
      // Phase 6b (D-082, D-083).
      ["send_nudge", { p_group: groupB, p_to: bMember.userId, p_kind: "praying" }],
      ["group_nudge_targets", { p_group: groupB }],
      ["my_nudges", { p_group: groupB }],
      ["set_group_nudges_muted", { p_group: groupB, p_muted: true }],
      ["request_partner", { p_group: groupB, p_user: bMember.userId }],
      ["my_partnerships", { p_group: groupB }],
    ];
    for (const [fn, args] of calls) {
      const { error } = await me.client.rpc(fn, args);
      expect(error?.code, fn).toBe("42501");
    }
    // Nor can anyone write the tables directly.
    const { error: insertError } = await me.client
      .from("group_members")
      .insert({ group_id: groupB, user_id: me.userId, role: "owner", status: "active", share_level: "full" });
    expect(insertError).not.toBeNull();
    const { data: updated } = await me.client.from("groups").update({ name: "Mine" }).eq("id", groupB).select();
    expect(updated ?? []).toEqual([]);

    // ---- and group B is untouched
    const { data: b } = await bOwner.client
      .from("groups")
      .select("name, archived_at, member_count")
      .eq("id", groupB)
      .single();
    expect(b).toEqual({ name: "Group B", archived_at: null, member_count: 2 });
    const { data: stillOpen } = await bOwner.client
      .from("group_covenant_proposals")
      .select("closed_at")
      .eq("id", proposal!.id)
      .single();
    expect(stillOpen?.closed_at).toBeNull();
  });
});
