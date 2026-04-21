-- =============================================================================
-- 챌린지 상세 그리드용 참여 샘플 10건 (SQL Editor · postgres 권한)
--
-- 이전 버전은 set_config(트랜잭션 로컬)라, 에디터가 문장마다 커밋하면 challenge_id가
-- 비어 INSERT가 실패하거나 잘못된 행이 생길 수 있었음 → 이 파일은 서브쿼리만 사용.
--
-- 붙는 챌린지: 앱 `fetchActiveChallenge`와 동일 조건
--   start_date <= now() AND end_date > now()
--   ORDER BY coalesce(banner_weight, 0) DESC, created_at DESC LIMIT 1
--
-- 주의: 앱에서 `/challenge?id=다른-uuid` 로 열면 그 챌린지에 행이 없을 수 있음.
--       그 경우 아래 「특정 챌린지 ID로 넣기」 블록을 id에 맞게 수정해 실행.
--
-- 전제: auth.users에 시드 제외 실유저 1명 이상( instance_id 복사용 )
--       public.challenges에 진행 중 행이 있거나, 아무 챌린지 1건 이상
-- =============================================================================

begin;

-- 0) 이전 시드 정리 (FK 순서)
delete from public.challenge_entries
where user_id in (select id from auth.users where email like 'challenge\_grid\_seed\_%@test.invalid' escape '\');

delete from public.cats
where user_id in (select id from auth.users where email like 'challenge\_grid\_seed\_%@test.invalid' escape '\');

delete from public.profiles
where id in (select id from auth.users where email like 'challenge\_grid\_seed\_%@test.invalid' escape '\');

delete from auth.identities
where user_id in (select id from auth.users where email like 'challenge\_grid\_seed\_%@test.invalid' escape '\');

delete from auth.users
where email like 'challenge\_grid\_seed\_%@test.invalid' escape '\';

do $$
begin
  if not exists (select 1 from auth.users limit 1) then
    raise exception 'auth.users가 비었습니다. 시드 삭제 후 남은 로그인 유저가 없으면 안 됩니다.';
  end if;
  if not exists (select 1 from public.challenges limit 1) then
    raise exception 'public.challenges에 행이 없습니다.';
  end if;
end $$;

-- 테스트 유저 10명 (instance_id = 기존 유저와 동일)
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  confirmation_token,
  recovery_token
)
select
  (select instance_id from auth.users limit 1),
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'challenge_grid_seed_' || lpad(g.n::text, 2, '0') || '@test.invalid',
  crypt('TestSeed123!', gen_salt('bf')),
  now(),
  now(),
  now(),
  '{}'::jsonb,
  '{}'::jsonb,
  '',
  ''
from generate_series(1, 10) as g(n);

-- identities 실패 시 이 블록만 주석 처리
insert into auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
)
select
  gen_random_uuid(),
  u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email),
  'email',
  u.email,
  now(),
  now(),
  now()
from auth.users u
where u.email like 'challenge\_grid\_seed\_%@test.invalid' escape '\';

insert into public.profiles (id, nickname)
select
  u.id,
  '시드집사' || regexp_replace(u.email, '^challenge_grid_seed_(\d+)@.*$', '\1')
from auth.users u
where u.email like 'challenge\_grid\_seed\_%@test.invalid' escape '\'
order by u.email;

insert into public.cats (user_id, name, is_neutered)
select
  u.id,
  '시드냥' || regexp_replace(u.email, '^challenge_grid_seed_(\d+)@.*$', '\1'),
  false
from auth.users u
where u.email like 'challenge\_grid\_seed\_%@test.invalid' escape '\'
order by u.email;

-- 3) 참여 10건: target 챌린지에 직접 조인 (set_config 사용 안 함)
insert into public.challenge_entries (challenge_id, user_id, photo_url, caption)
select
  t.challenge_id,
  u.id,
  'https://picsum.photos/seed/challengegrid' || regexp_replace(u.email, '^challenge_grid_seed_(\d+)@.*$', '\1') || '/400/400',
  '테스트 참여 #' || regexp_replace(u.email, '^challenge_grid_seed_(\d+)@.*$', '\1') || ' · [seed-entry]'
from auth.users u
cross join lateral (
  select coalesce(
    (select c.id
     from public.challenges c
     where c.start_date <= now() and c.end_date > now()
     order by coalesce(c.banner_weight, 0) desc, c.created_at desc
     limit 1),
    (select c2.id from public.challenges c2 order by c2.created_at desc limit 1)
  ) as challenge_id
) t
where u.email like 'challenge\_grid\_seed\_%@test.invalid' escape '\'
  and t.challenge_id is not null
order by u.email;

commit;

/*
-- 특정 챌린지 ID로 넣기 (목록에서 연 챌린지와 id가 다를 때)
begin;
-- … 위와 동일하게 delete + auth insert … 까지 실행한 뒤, 아래만 challenge_id 고정:

insert into public.challenge_entries (challenge_id, user_id, photo_url, caption)
select
  '00000000-0000-0000-0000-000000000000'::uuid,  -- ← 여기를 실제 challenges.id 로 교체
  u.id,
  'https://picsum.photos/seed/challengegrid' || regexp_replace(u.email, '^challenge_grid_seed_(\d+)@.*$', '\1') || '/400/400',
  '테스트 참여 #' || regexp_replace(u.email, '^challenge_grid_seed_(\d+)@.*$', '\1') || ' · [seed-entry]'
from auth.users u
where u.email like 'challenge\_grid\_seed\_%@test.invalid' escape '\'
order by u.email;
commit;
*/
