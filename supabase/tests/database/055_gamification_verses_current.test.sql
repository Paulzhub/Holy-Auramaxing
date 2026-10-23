-- Badge and level verses come from the current World English Bible (grace
-- review 2, GS-1/GS-2/GR-4, D-105). src/features/gamification/levels.test.ts
-- checks every row of the migration against data/*.json; this checks the
-- database ended up with them.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select is((select reference from public.level_tiers where tier = 45), '2 Samuel 6:14', 'Undignified Dancer dances, not "vile"');
select is((select reference from public.level_tiers where tier = 108), 'Matthew 7:14', 'Narrow Gate is the road to life');
select is((select verse_text from public.level_tiers where tier = 105), 'You are the salt of the earth…', 'Salt of the Earth keeps its first clause only');
select is((select verse_text from public.level_tiers where tier = 62),
  'Who knows if you haven’t come to the kingdom for such a time as this?', 'Such a Time keeps its last sentence');
select ok((select verse_text from public.badges where slug = 'free_1') like '%his mercies don’t fail.', 'First Step reads like Home');
select is((select count(*)::int from public.level_tiers where verse_text ~ '^[a-z]' or verse_text ~ '[,;:]$'), 0,
  'no level verse starts or ends mid-sentence without “…”');
select is((select count(*)::int from public.badges where verse_text ~ '^[a-z]' or verse_text ~ '[,;:]$'), 0,
  'no badge verse starts or ends mid-sentence without “…”');
select is((select count(*)::int from public.level_tiers
  where length(verse_text) - length(replace(verse_text, '“', '')) <> length(verse_text) - length(replace(verse_text, '”', ''))), 0,
  'every opened quotation mark is closed');

select * from finish();
rollback;
