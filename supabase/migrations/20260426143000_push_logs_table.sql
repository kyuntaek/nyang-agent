create table if not exists public.push_logs (
  id uuid primary key default gen_random_uuid(),
  title text,
  body text,
  target text,
  sent_count int default 0,
  success_count int default 0,
  created_at timestamptz not null default now()
);
