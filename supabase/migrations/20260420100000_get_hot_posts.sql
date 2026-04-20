-- 최근 24시간 글 중 인기도 상위 3개 (RPC)
-- 점수 = (like_count * 3) + (comment_count * 2) + 시간 가산(경과 시각)

create or replace function public.get_hot_posts()
returns setof public.posts
language sql
stable
as $$
  select *
  from public.posts
  where created_at > now() - interval '24 hours'
  order by
    (like_count * 3) + (comment_count * 2)
    + extract(epoch from (created_at - (now() - interval '24 hours'))) / 3600
  desc
  limit 3;
$$;

grant execute on function public.get_hot_posts() to authenticated;
grant execute on function public.get_hot_posts() to anon;
