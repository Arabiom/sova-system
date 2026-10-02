-- Hardening after the full review:
-- • A site's price, tier, number and place on the map are set by admin / finance only. Marketing
--   may still book a free site for its own participant (exhibitor_id), as before — the database
--   now refuses any other change from them, whatever app or tool sends it.
-- • Helper functions that only staff use are no longer callable by visitors without an account
--   (they already returned nothing to them; this closes the door completely).
--
-- Additive only. Safe to run more than once.

create or replace function public.protect_site_pricing()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- The SQL editor and server jobs (not the app's signed-in users) are not limited.
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  if coalesce(public.staff_role(), '') in ('admin', 'finance') then
    return new;
  end if;
  if new.tier is distinct from old.tier
     or new.price is distinct from old.price
     or new.number is distinct from old.number
     or new.exhibition_id is distinct from old.exhibition_id
     or new.map_x is distinct from old.map_x
     or new.map_y is distinct from old.map_y then
    raise exception 'only admin or finance can change a site''s price, tier or place'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists exhibition_sites_protect_pricing on public.exhibition_sites;
create trigger exhibition_sites_protect_pricing
  before update on public.exhibition_sites
  for each row execute function public.protect_site_pricing();

revoke execute on function public.staff_display_name(uuid) from public, anon;
revoke execute on function public.find_client(text) from public, anon;
revoke execute on function public.track_activity() from public, anon;
revoke execute on function public.whatsapp_last_contact() from public, anon;
revoke execute on function public.generate_recurring_company_expenses() from public, anon;
grant execute on function public.staff_display_name(uuid) to authenticated;
grant execute on function public.find_client(text) to authenticated;
grant execute on function public.track_activity() to authenticated;
grant execute on function public.whatsapp_last_contact() to authenticated;
grant execute on function public.generate_recurring_company_expenses() to authenticated;
