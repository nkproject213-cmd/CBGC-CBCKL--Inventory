-- Existing databases: run npm run db:init (also safe on a fresh database).
-- This single statement casts bigint directly in Postgres, without passing through JavaScript.
DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.inventory_items'::regclass AND attname = 'purchase_price'
      AND atttypid = 'bigint'::regtype AND NOT attisdropped
  ) THEN
    PERFORM set_config('lock_timeout', '5s', true);
    ALTER TABLE public.inventory_items ALTER COLUMN purchase_price TYPE text USING purchase_price::text;
  END IF;
END
$migration$;
