-- Create claim-documents storage bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'claim-documents',
  'claim-documents',
  false,  -- private, accessed via signed URLs or Edge Function proxy
  10485760,  -- 10MB limit
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
) on conflict (id) do nothing;

-- Members can upload documents for their own claims
-- The claim must belong to them (checked via claims table)
create policy "claim_docs_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'claim-documents'
    and exists (
      select 1 from public.claims c
      where c.id::text = (string_to_array(name, '/'))[1]
        and c.member_id = auth.uid()
    )
  );

-- Members can read their own claim documents
create policy "claim_docs_read_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'claim-documents'
    and exists (
      select 1 from public.claims c
      where c.id::text = (string_to_array(name, '/'))[1]
        and c.member_id = auth.uid()
    )
  );

-- Admins (service-role) can read all claim documents (bypasses RLS)
-- No explicit policy needed — service-role bypasses RLS
