-- 입양일(선택). 없으면 앱에서 created_at으로 함께한 날을 계산합니다.
alter table public.cats add column if not exists adopted_at date;
