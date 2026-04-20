-- 본인 챌린지 참여만 수정·삭제
drop policy if exists "challenge_entries_update_own" on public.challenge_entries;
create policy "challenge_entries_update_own"
on public.challenge_entries for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "challenge_entries_delete_own" on public.challenge_entries;
create policy "challenge_entries_delete_own"
on public.challenge_entries for delete
to authenticated
using (auth.uid() = user_id);
