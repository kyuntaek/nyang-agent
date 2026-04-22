alter table public.push_logs
add column if not exists failure_reason text;
