alter table public.profiles
add column if not exists last_activity_at timestamptz;
