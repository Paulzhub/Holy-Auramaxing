begin;
select plan(7);

select has_schema('util', 'util schema exists');
select has_function('util', 'uuid_v7', 'util.uuid_v7() exists');

select is(
  substring(util.uuid_v7()::text from 15 for 1),
  '7',
  'UUID version nibble is 7'
);

select ok(
  substring(util.uuid_v7()::text from 20 for 1) in ('8', '9', 'a', 'b'),
  'UUID variant is RFC 9562 (10xx)'
);

-- Time-ordered: an ID made later sorts after one made earlier.
create temporary table ids as select util.uuid_v7() as id, 1 as n;
select pg_sleep(0.005);
insert into ids select util.uuid_v7(), 2;
select ok(
  (select id from ids where n = 2) > (select id from ids where n = 1),
  'UUIDs created later sort later'
);

select is(
  (select count(distinct util.uuid_v7()) from generate_series(1, 1000)),
  1000::bigint,
  '1,000 calls give 1,000 distinct IDs'
);

-- The helper schema is not exposed to anonymous visitors.
select ok(
  not has_schema_privilege('anon', 'util', 'usage'),
  'anon has no access to util'
);

select * from finish();
rollback;
