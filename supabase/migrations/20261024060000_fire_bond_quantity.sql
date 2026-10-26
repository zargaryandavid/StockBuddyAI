-- Bonds are entered as a quantity and a price per bond; face value (principal) is
-- their product. Rental income may also record the property's market value in
-- principal. Both new columns are optional so existing entries stay valid.
alter table public.fire_entries
  add column quantity numeric(18, 4) check (quantity is null or quantity >= 0),
  add column unit_price numeric(18, 4) check (unit_price is null or unit_price >= 0);
