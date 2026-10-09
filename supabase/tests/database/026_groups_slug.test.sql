begin;
create extension if not exists pgtap with schema extensions;

select plan(5);

-- Accessibility review 1 (side find): the 40-character cut must never leave a
-- trailing hyphen, or the slug check refuses the group.
select matches(
  private.make_group_slug('A group with a long name for the narrow screen test'),
  '^a-group-with-a-long-name-for-the-narrow-[0-9a-f]{10}$',
  'a cut that lands on a space drops the hyphen'
);
select matches(
  private.make_group_slug('Evening Fellowship of the Long Road!! Brothers'),
  '^[a-z0-9]+(-[a-z0-9]+)*$',
  'a cut that lands on punctuation still makes a valid slug'
);
select matches(private.make_group_slug('  ---  '), '^group-[0-9a-f]{10}$', 'a name with no letters falls back to "group"');
select matches(private.make_group_slug('Grace Men'), '^grace-men-[0-9a-f]{10}$', 'short names are unchanged');
select ok(
  (select bool_and(private.make_group_slug(repeat('ab ', n)) ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(private.make_group_slug(repeat('ab ', n))) <= 80)
   from generate_series(1, 40) n),
  'every cut point gives a slug the check accepts'
);

select * from finish();
rollback;
