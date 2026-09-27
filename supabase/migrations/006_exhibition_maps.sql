-- 006: a map image (designed outside the system) attached to each exhibition
--
-- • exhibitions.map_path: path of the file in the "exhibition-maps" storage bucket
-- • the bucket is PRIVATE: files are shown to signed-in staff through short-lived links
-- • every staff member can view maps; admin/finance upload, replace and delete them
--
-- Needs 003 first. Additive only — no data is deleted. Safe to run more than once.

alter table public.exhibitions add column if not exists map_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('exhibition-maps', 'exhibition-maps', false, 10485760,
        array['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists exhibition_maps_read on storage.objects;
drop policy if exists exhibition_maps_insert on storage.objects;
drop policy if exists exhibition_maps_update on storage.objects;
drop policy if exists exhibition_maps_delete on storage.objects;

create policy exhibition_maps_read on storage.objects for select to authenticated
  using (bucket_id = 'exhibition-maps' and public.staff_role() is not null);
create policy exhibition_maps_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'exhibition-maps' and public.staff_role() in ('admin', 'finance'));
create policy exhibition_maps_update on storage.objects for update to authenticated
  using (bucket_id = 'exhibition-maps' and public.staff_role() in ('admin', 'finance'))
  with check (bucket_id = 'exhibition-maps' and public.staff_role() in ('admin', 'finance'));
create policy exhibition_maps_delete on storage.objects for delete to authenticated
  using (bucket_id = 'exhibition-maps' and public.staff_role() in ('admin', 'finance'));
