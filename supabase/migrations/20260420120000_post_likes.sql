-- 게시글 좋아요 (사용자당 1회)
create table if not exists public.post_likes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists idx_post_likes_user on public.post_likes (user_id);

alter table public.post_likes enable row level security;

drop policy if exists "post_likes_select_own" on public.post_likes;
create policy "post_likes_select_own"
on public.post_likes for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "post_likes_insert_own" on public.post_likes;
create policy "post_likes_insert_own"
on public.post_likes for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "post_likes_delete_own" on public.post_likes;
create policy "post_likes_delete_own"
on public.post_likes for delete
to authenticated
using (auth.uid() = user_id);

-- posts.like_count 동기화
create or replace function public.post_likes_sync_post_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set like_count = like_count + 1 where id = new.post_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.posts set like_count = greatest(0, like_count - 1) where id = old.post_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists post_likes_after_insert on public.post_likes;
create trigger post_likes_after_insert
after insert on public.post_likes
for each row execute function public.post_likes_sync_post_count();

drop trigger if exists post_likes_after_delete on public.post_likes;
create trigger post_likes_after_delete
after delete on public.post_likes
for each row execute function public.post_likes_sync_post_count();
