-- 복수 챌린지 운영: 동시에 여러 행 가능. 홈 배너는 앱에서
-- (진행 구간 내) banner_weight 내림차순 → created_at 내림차순으로 최신 1건 선택.
alter table public.challenges
  add column if not exists banner_weight integer not null default 0;

comment on column public.challenges.banner_weight is
  '홈 상단 배너 우선순위. 값이 클수록 우선(동률이면 created_at 최신). 새 챌린지를 강조하려면 이전보다 큰 값을 넣으면 됩니다.';

create index if not exists idx_challenges_window_banner
  on public.challenges (end_date desc, start_date desc, banner_weight desc, created_at desc);
