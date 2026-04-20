-- 이미 20170000 구버전을 적용한 경우: INTO new.* 가 스키마 new 로 파싱되어 실패했을 수 있음 → 함수만 교체

create or replace function public.post_comments_fill_author_nickname()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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
