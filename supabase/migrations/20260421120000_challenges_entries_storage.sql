-- 챌린지 + 참여(사진) + Storage
create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  start_date timestamptz not null,
  end_date timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.challenge_entries (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  photo_url text not null,
  caption text,
  created_at timestamptz not null default now(),
  constraint challenge_entries_one_per_user unique (challenge_id, user_id)
);

create index if not exists idx_challenge_entries_challenge on public.challenge_entries (challenge_id);
create index if not exists idx_challenge_entries_created on public.challenge_entries (created_at desc);
create index if not exists idx_challenges_end on public.challenges (end_date desc);

alter table public.challenges enable row level security;
alter table public.challenge_entries enable row level security;

drop policy if exists "challenges_select_all" on public.challenges;
create policy "challenges_select_all"
on public.challenges for select
to authenticated
using (true);

drop policy if exists "challenge_entries_select_all" on public.challenge_entries;
create policy "challenge_entries_select_all"
on public.challenge_entries for select
to authenticated
using (true);

drop policy if exists "challenge_entries_insert_own" on public.challenge_entries;
create policy "challenge_entries_insert_own"
on public.challenge_entries for insert
to authenticated
with check (auth.uid() = user_id);

-- Storage: challenge-photos (경로 첫 세그먼트 = auth.uid())
insert into storage.buckets (id, name, public)
values ('challenge-photos', 'challenge-photos', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "challenge_photos_select" on storage.objects;
create policy "challenge_photos_select"
on storage.objects for select
using (bucket_id = 'challenge-photos');

drop policy if exists "challenge_photos_insert" on storage.objects;
create policy "challenge_photos_insert"
on storage.objects for insert
with check (
  bucket_id = 'challenge-photos'
  and auth.role() = 'authenticated'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists "challenge_photos_delete_own" on storage.objects;
create policy "challenge_photos_delete_own"
on storage.objects for delete
using (
  bucket_id = 'challenge-photos'
  and auth.role() = 'authenticated'
  and split_part(name, '/', 1) = auth.uid()::text
);

-- 샘플 챌린지 (이미 있으면 제목으로 건너뛰기 어려우므로 idempotent: 없을 때만)
insert into public.challenges (title, description, start_date, end_date)
select
  '냥이 낮잠 자는 곳 인증',
  '우리 냥이가 제일 좋아하는 낮잠 장소를 공유해요!',
  now(),
  now() + interval '7 days'
where not exists (
  select 1 from public.challenges c
  where c.title = '냥이 낮잠 자는 곳 인증'
);
