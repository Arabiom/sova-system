-- Interactive exhibition map: where each site sits on the exhibition's map image, as a
-- percentage of the image width (map_x) and height (map_y), 0–100. Empty = not placed yet.
-- The map image itself is the one already attached to the exhibition (migration 006).
--
-- Additive only. Safe to run more than once.

alter table public.exhibition_sites add column if not exists map_x numeric;
alter table public.exhibition_sites add column if not exists map_y numeric;

alter table public.exhibition_sites drop constraint if exists exhibition_sites_map_pos_check;
alter table public.exhibition_sites add constraint exhibition_sites_map_pos_check
  check ((map_x is null or (map_x >= 0 and map_x <= 100)) and (map_y is null or (map_y >= 0 and map_y <= 100)));
