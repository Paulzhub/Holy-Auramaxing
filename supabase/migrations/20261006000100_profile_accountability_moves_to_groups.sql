-- profile: accountability settings move from each person to each group
-- (owner decision, docs/decisions.md D-027).
--
-- Whether members appear on the leaderboard, and the minimum a group sees
-- about each member's check-ins, become part of a group's covenant in
-- Phase 3 (groups.min_share_level, groups.leaderboard_hiding_allowed),
-- accepted by each member before joining. The per-person defaults are
-- removed so nothing suggests a choice the app no longer offers.

alter table public.privacy_settings drop column show_in_leaderboards;
alter table public.privacy_settings drop column default_share_level;
