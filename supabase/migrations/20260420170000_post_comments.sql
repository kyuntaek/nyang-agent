-- 게시글 댓글 + posts.comment_count 동기화

create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  author_nickname text not null default '냥집사',
  created_at timestamptz not null default now(),
  constraint post_comments_body_chk check (char_length(trim(body)) > 0)
);

create index if not exists idx_post_comments_post_created on public.post_comments (post_id, created_at);

comment on table public.post_comments is '커뮤니티 게시글 댓글';
comment on column public.post_comments.author_nickname is '작성 시점 닉네임 (트리거로 profiles에서 채움)';

-- 작성자 닉네임 자동 채움 (RLS 없이 profiles 조회)
create or replace function public.post_comments_fill_author_nickname()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- SELECT … INTO 변수 는 일부 클라이언트/컨텍스트에서 변수가 아닌 관계명으로 파싱될 수 있어,
  -- 스칼라 서브쿼리 + NEW 대입만 사용합니다. (profiles.nickname)
  -- "into new.col" 도 스키마 new 오류가 나므로 사용하지 않습니다.
  NEW.author_nickname := coalesce(
    nullif(
      trim(
        (select p.nickname from public.profiles p where p.id = NEW.user_id limit 1)::text
      ),
      ''
    ),
    '냥집사'
  );
  if NEW.author_nickname is null or btrim(NEW.author_nickname) = '' then
    NEW.author_nickname := '냥집사';
  end if;
  return NEW;
end;
$$;

drop trigger if exists post_comments_fill_author_nickname_trg on public.post_comments;
create trigger post_comments_fill_author_nickname_trg
before insert on public.post_comments
for each row
execute function public.post_comments_fill_author_nickname();

create or replace function public.post_comments_sync_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set comment_count = comment_count + 1 where id = NEW.post_id;
  elsif tg_op = 'DELETE' then
    update public.posts set comment_count = greatest(0, comment_count - 1) where id = OLD.post_id;
  end if;
  return null;
end;
$$;

drop trigger if exists post_comments_sync_count_ins on public.post_comments;
create trigger post_comments_sync_count_ins
after insert on public.post_comments
for each row
execute function public.post_comments_sync_count();

drop trigger if exists post_comments_sync_count_del on public.post_comments;
create trigger post_comments_sync_count_del
after delete on public.post_comments
for each row
execute function public.post_comments_sync_count();

alter table public.post_comments enable row level security;

drop policy if exists "post_comments_select_authenticated" on public.post_comments;
create policy "post_comments_select_authenticated"
on public.post_comments for select
to authenticated
using (true);

drop policy if exists "post_comments_insert_own" on public.post_comments;
create policy "post_comments_insert_own"
on public.post_comments for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "post_comments_delete_own" on public.post_comments;
create policy "post_comments_delete_own"
on public.post_comments for delete
to authenticated
using (auth.uid() = user_id);
