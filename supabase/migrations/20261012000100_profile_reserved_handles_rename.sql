-- profile: reserve the app's new name as a handle (D-059). The app is now
-- "Holy Auramaxing" everywhere people see it; nobody should be able to pose
-- as it with a look-alike handle. The old spellings stay reserved.
insert into private.reserved_handles (handle)
values ('auramaxing'), ('holy_auramaxing'), ('holyauramaxing')
on conflict do nothing;
