-- Storage buckets.
--   media      public   real portfolio/cover media and labelled AI concept boards
--   references private  client reference photos from the builder (signed URLs only)
--   documents  private  quote/invoice PDFs (signed URLs only)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('media', 'media', true, 52428800, array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'video/mp4', 'video/webm']),
  ('references', 'references', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']),
  ('documents', 'documents', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

-- The owner manages the public media bucket from the admin. Uploads to the
-- private buckets happen only through server code using the service role.
create policy media_bucket_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and public.is_owner());
create policy media_bucket_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'media' and public.is_owner()) with check (bucket_id = 'media' and public.is_owner());
create policy media_bucket_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media' and public.is_owner());
create policy private_buckets_owner_select on storage.objects for select to authenticated
  using (bucket_id in ('references', 'documents', 'media') and public.is_owner());
