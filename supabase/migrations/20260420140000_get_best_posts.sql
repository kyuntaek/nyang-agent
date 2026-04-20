-- 베스트 글: 좋아요·댓글 수 가중 점수로 선정 (RPC)
-- 점수 = (like_count * 3) + (comment_count * 2), 동점이면 최신 글 우선

create or replace function public.get_best_posts(p_limit integer default 5)
returns setof public.posts
language sql
stable
as $$
  select *
  from public.posts
  order by
    (like_count * 3) + (comment_count * 2) desc,
    like_count desc,
    comment_count desc,
    created_at desc
  limit greatest(1, least(coalesce(p_limit, 5), 50));
$$;

comment on function public.get_best_posts(integer) is
  '베스트 글: (좋아요*3)+(댓글*2) 점수 내림차순, 동점 시 최신순. p_limit 기본 5, 최대 50';

grant execute on function public.get_best_posts(integer) to authenticated;
grant execute on function public.get_best_posts(integer) to anon;
