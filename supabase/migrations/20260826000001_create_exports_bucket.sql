-- Storage policies for the 'exports' bucket
-- Allow authenticated users to upload files under their own folder
create policy "exports_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'exports'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow authenticated users to read files under their own folder
create policy "exports_select_own"
  on storage.objects for select
  using (
    bucket_id = 'exports'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow authenticated users to delete files under their own folder
create policy "exports_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'exports'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
