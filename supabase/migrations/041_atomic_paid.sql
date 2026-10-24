-- The paid total of a participant moves in one step on the server. Before, the browser read the
-- total and wrote it back: two payments recorded at the same moment for the same participant
-- could lose one of them. The usual rules still apply (who may edit, marketing never edits paid).

create or replace function public.adjust_exhibitor_paid(p_id uuid, p_delta numeric)
returns numeric
language sql
security invoker
set search_path = public
as $$
  update public.exhibitors
     set paid = greatest(0, coalesce(paid, 0) + coalesce(p_delta, 0))
   where id = p_id
  returning paid;
$$;
revoke execute on function public.adjust_exhibitor_paid(uuid, numeric) from public, anon;
grant execute on function public.adjust_exhibitor_paid(uuid, numeric) to authenticated;

notify pgrst, 'reload schema';
