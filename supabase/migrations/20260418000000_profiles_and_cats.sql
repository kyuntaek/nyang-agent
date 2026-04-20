-- UUID 생성 (Supabase에서 보통 이미 활성화)
create extension if not exists pgcrypto;

-- 1) profiles — cats.user_id FK 대상 (id = auth.users.id)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text,
  created_at timestamptz not null default now()
);

-- 2) cats
create table if not exists public.cats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  breed text,
  gender text,
  birth_date date,
  weight_kg numeric,
  is_neutered boolean not null default false,
  indoor_outdoor text,
  current_food text,
  health_notes text,
  "nyanBTI_type" text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create index if not exists idx_cats_user_id on public.cats (user_id);

alter table public.profiles enable row level security;
alter table public.cats enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "cats_select_own" on public.cats;
create policy "cats_select_own" on public.cats for select using (auth.uid() = user_id);

drop policy if exists "cats_insert_own" on public.cats;
create policy "cats_insert_own" on public.cats for insert with check (auth.uid() = user_id);

drop policy if exists "cats_update_own" on public.cats;
create policy "cats_update_own"
on public.cats
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "cats_delete_own" on public.cats;
create policy "cats_delete_own" on public.cats for delete using (auth.uid() = user_id);
