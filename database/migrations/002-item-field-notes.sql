-- Additive. Existing typed item data and lifecycle queries require no conversion.
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS acquired_date_text TEXT,
  ADD COLUMN IF NOT EXISTS useful_life_years_text TEXT,
  ADD COLUMN IF NOT EXISTS quantity_text TEXT,
  ADD COLUMN IF NOT EXISTS photo_url_text TEXT;
