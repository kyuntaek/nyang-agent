-- 본인 댓글 수정 (RLS)
drop policy if exists "post_comments_update_own" on public.post_comments;
create policy "post_comments_update_own"
on public.post_comments for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
