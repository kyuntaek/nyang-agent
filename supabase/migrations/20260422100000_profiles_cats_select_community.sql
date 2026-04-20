-- 커뮤니티·챌린지에서 타인 닉네임·냥 정보 표시 (로그인 사용자 간 읽기)
-- 기존 본인 전용 정책과 OR로 동작합니다.

drop policy if exists "profiles_select_community" on public.profiles;
create policy "profiles_select_community"
on public.profiles for select
to authenticated
using (true);

drop policy if exists "cats_select_community" on public.cats;
create policy "cats_select_community"
on public.cats for select
to authenticated
using (true);
