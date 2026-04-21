-- 커뮤니티 검색 RPC: 정렬(최신 / 댓글 / 좋아요) — 기존 5인자 시그니처 제거 후 6인자로 교체
drop function if exists public.community_posts_page(uuid, text, text, int, int);

create or replace function public.community_posts_page(
  p_only_user_id uuid,
  p_channel text,
  p_search text,
  p_offset int,
  p_limit int,
  p_sort text default 'latest'
)
returns table (
  id uuid,
  user_id uuid,
  cat_id uuid,
  channel text,
  body text,
  agent_summary text,
  like_count int,
  comment_count int,
  created_at timestamptz,
  image_urls text[],
  video_url text,
  profile_nickname text,
  profile_avatar_url text,
  cat_name text,
  cat_breed text,
  cat_avatar_url text,
  cat_representative_photo_url text
)
language sql
stable
set search_path = public
as $$
  with st as (
    select nullif(
      btrim(
        replace(replace(replace(coalesce(p_search, ''), '%', ''), '_', ''), ',', ' ')
      ),
      ''
    ) as term
  )
  select
    p.id,
    p.user_id,
    p.cat_id,
    p.channel::text,
    p.body,
    p.agent_summary,
    p.like_count,
    p.comment_count,
    p.created_at,
    p.image_urls,
    p.video_url,
    pr.nickname as profile_nickname,
    pr.avatar_url as profile_avatar_url,
    c.name as cat_name,
    c.breed as cat_breed,
    c.avatar_url as cat_avatar_url,
    c.representative_photo_url as cat_representative_photo_url
  from public.posts p
  left join public.profiles pr on pr.id = p.user_id
  left join public.cats c on c.id = p.cat_id
  cross join st
  where (p_only_user_id is null or p.user_id = p_only_user_id)
    and (p_channel is null or p.channel = p_channel)
    and (
      st.term is null
      or p.body ilike '%' || st.term || '%'
      or coalesce(p.agent_summary, '') ilike '%' || st.term || '%'
      or coalesce(pr.nickname, '') ilike '%' || st.term || '%'
      or coalesce(c.name, '') ilike '%' || st.term || '%'
    )
  order by
    case when coalesce(nullif(btrim(p_sort), ''), 'latest') = 'likes' then p.like_count end desc nulls last,
    case when coalesce(nullif(btrim(p_sort), ''), 'latest') = 'comments' then p.comment_count end desc nulls last,
    p.created_at desc
  offset greatest(0, coalesce(p_offset, 0))
  limit greatest(1, least(coalesce(p_limit, 12), 100));
$$;

comment on function public.community_posts_page(uuid, text, text, int, int, text) is
  '커뮤니티 목록: 채널·작성자 필터 + 본문/요약/닉네임/냥이름 OR 검색. p_sort: latest | likes | comments.';

grant execute on function public.community_posts_page(uuid, text, text, int, int, text) to authenticated;
