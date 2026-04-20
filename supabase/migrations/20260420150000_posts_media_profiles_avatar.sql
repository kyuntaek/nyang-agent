-- 집사 프로필 사진
alter table public.profiles add column if not exists avatar_url text;

-- 게시글 첨부: 이미지 URL 배열 + 단일 동영상(또는 임베드) 링크
alter table public.posts add column if not exists image_urls text[] not null default '{}';
alter table public.posts add column if not exists video_url text;

comment on column public.posts.image_urls is '첨부 이미지 공개 URL 목록 (Storage 등)';
comment on column public.posts.video_url is '동영상 페이지 링크 (YouTube 등)';
comment on column public.profiles.avatar_url is '집사 프로필 이미지 공개 URL';

-- Storage: post-media (경로 첫 세그먼트 = auth.uid())
insert into storage.buckets (id, name, public)
values ('post-media', 'post-media', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "post_media_storage_select" on storage.objects;
create policy "post_media_storage_select"
on storage.objects for select
using (bucket_id = 'post-media');

drop policy if exists "post_media_storage_insert" on storage.objects;
create policy "post_media_storage_insert"
on storage.objects for insert
with check (
  bucket_id = 'post-media'
  and auth.role() = 'authenticated'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists "post_media_storage_delete" on storage.objects;
create policy "post_media_storage_delete"
on storage.objects for delete
using (
  bucket_id = 'post-media'
  and auth.role() = 'authenticated'
  and split_part(name, '/', 1) = auth.uid()::text
);
