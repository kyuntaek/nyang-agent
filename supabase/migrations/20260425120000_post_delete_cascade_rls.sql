-- posts 삭제 시 CASCADE로 post_comments / post_likes 행이 지워지는데,
-- 기존 DELETE 정책이 "본인 user_id 행만" 허용이라 다른 사용자 댓글·좋아요가 남은 글은
-- 게시글 삭제가 RLS에 막힙니다. 글 작성자는 해당 글에 달린 댓글·좋아요 삭제를 허용합니다.

drop policy if exists "post_comments_delete_post_owner" on public.post_comments;
create policy "post_comments_delete_post_owner"
on public.post_comments for delete
to authenticated
using (
  exists (
    select 1
    from public.posts p
    where p.id = post_comments.post_id
      and p.user_id = auth.uid()
  )
);

drop policy if exists "post_likes_delete_post_owner" on public.post_likes;
create policy "post_likes_delete_post_owner"
on public.post_likes for delete
to authenticated
using (
  exists (
    select 1
    from public.posts p
    where p.id = post_likes.post_id
      and p.user_id = auth.uid()
  )
);
