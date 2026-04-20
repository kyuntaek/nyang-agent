-- 커뮤니티 피드 posts
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  cat_id uuid references public.cats (id) on delete set null,
  channel text not null,
  body text not null,
  agent_summary text,
  like_count int not null default 0,
  comment_count int not null default 0,
  created_at timestamptz not null default now(),
  constraint posts_channel_chk check (
    channel in ('koshort', 'food', 'health', 'daily', 'goods')
  )
);

create index if not exists idx_posts_created_at on public.posts (created_at desc);
create index if not exists idx_posts_channel_created on public.posts (channel, created_at desc);

alter table public.posts enable row level security;

drop policy if exists "posts_select_authenticated" on public.posts;
create policy "posts_select_authenticated"
on public.posts for select
to authenticated
using (true);

drop policy if exists "posts_insert_own" on public.posts;
create policy "posts_insert_own"
on public.posts for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "posts_update_own" on public.posts;
create policy "posts_update_own"
on public.posts for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "posts_delete_own" on public.posts;
create policy "posts_delete_own"
on public.posts for delete
to authenticated
using (auth.uid() = user_id);
