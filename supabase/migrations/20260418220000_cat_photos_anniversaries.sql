-- 냥이 생애 앨범 + 기념일
create table if not exists public.cat_photos (
  id uuid primary key default gen_random_uuid(),
  cat_id uuid not null references public.cats (id) on delete cascade,
  url text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_cat_photos_cat_id on public.cat_photos (cat_id);

create table if not exists public.anniversaries (
  id uuid primary key default gen_random_uuid(),
  cat_id uuid not null references public.cats (id) on delete cascade,
  title text not null,
  date date not null,
  repeat_yearly boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_anniversaries_cat_id on public.anniversaries (cat_id);

alter table public.cat_photos enable row level security;
alter table public.anniversaries enable row level security;

drop policy if exists "cat_photos_select_own" on public.cat_photos;
create policy "cat_photos_select_own"
on public.cat_photos for select
using (
  exists (select 1 from public.cats c where c.id = cat_photos.cat_id and c.user_id = auth.uid())
);

drop policy if exists "cat_photos_insert_own" on public.cat_photos;
create policy "cat_photos_insert_own"
on public.cat_photos for insert
with check (
  exists (select 1 from public.cats c where c.id = cat_id and c.user_id = auth.uid())
);

drop policy if exists "cat_photos_delete_own" on public.cat_photos;
create policy "cat_photos_delete_own"
on public.cat_photos for delete
using (
  exists (select 1 from public.cats c where c.id = cat_photos.cat_id and c.user_id = auth.uid())
);

drop policy if exists "anniversaries_select_own" on public.anniversaries;
create policy "anniversaries_select_own"
on public.anniversaries for select
using (
  exists (select 1 from public.cats c where c.id = anniversaries.cat_id and c.user_id = auth.uid())
);

drop policy if exists "anniversaries_insert_own" on public.anniversaries;
create policy "anniversaries_insert_own"
on public.anniversaries for insert
with check (
  exists (select 1 from public.cats c where c.id = cat_id and c.user_id = auth.uid())
);

drop policy if exists "anniversaries_update_own" on public.anniversaries;
create policy "anniversaries_update_own"
on public.anniversaries for update
using (
  exists (select 1 from public.cats c where c.id = anniversaries.cat_id and c.user_id = auth.uid())
)
with check (
  exists (select 1 from public.cats c where c.id = cat_id and c.user_id = auth.uid())
);

drop policy if exists "anniversaries_delete_own" on public.anniversaries;
create policy "anniversaries_delete_own"
on public.anniversaries for delete
using (
  exists (select 1 from public.cats c where c.id = anniversaries.cat_id and c.user_id = auth.uid())
);

-- Storage: 공개 읽기, 본인 폴더(첫 세그먼트 = auth.uid())에만 업로드/삭제
insert into storage.buckets (id, name, public)
values ('cat-photos', 'cat-photos', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "cat_photos_storage_select" on storage.objects;
create policy "cat_photos_storage_select"
on storage.objects for select
using (bucket_id = 'cat-photos');

drop policy if exists "cat_photos_storage_insert" on storage.objects;
create policy "cat_photos_storage_insert"
on storage.objects for insert
with check (
  bucket_id = 'cat-photos'
  and auth.role() = 'authenticated'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists "cat_photos_storage_delete" on storage.objects;
create policy "cat_photos_storage_delete"
on storage.objects for delete
using (
  bucket_id = 'cat-photos'
  and auth.role() = 'authenticated'
  and split_part(name, '/', 1) = auth.uid()::text
);
