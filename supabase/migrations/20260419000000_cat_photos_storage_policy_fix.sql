-- RN 업로드 시 JWT는 authenticated 역할이지만, INSERT 정책을 명시적으로 authenticated에만 두고
-- 경로 첫 폴더 = auth.uid() 패턴을 storage.foldername으로 통일합니다.
drop policy if exists "cat_photos_storage_insert" on storage.objects;
create policy "cat_photos_storage_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'cat-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "cat_photos_storage_delete" on storage.objects;
create policy "cat_photos_storage_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'cat-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);
