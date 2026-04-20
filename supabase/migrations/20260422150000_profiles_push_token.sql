-- Expo 푸시 토큰 (Edge / 클라이언트에서 갱신)
alter table public.profiles add column if not exists push_token text;

comment on column public.profiles.push_token is 'Expo Push Token (ExponentPushToken[...]). 앱에서 로그인 후 등록.';
