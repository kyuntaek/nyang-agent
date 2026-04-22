update public.profiles as p
set email = u.email
from auth.users as u
where coalesce(trim(p.email), '') = ''
  and u.email is not null
  and (
    p.id::text = u.id::text
    or p.id::text = u.email
  );
