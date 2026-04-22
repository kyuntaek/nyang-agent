update public.profiles as p
set email = u.email
from auth.users as u
where p.id = u.id
  and u.email is not null
  and coalesce(trim(p.email), '') = '';
