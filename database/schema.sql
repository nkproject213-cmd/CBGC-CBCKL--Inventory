CREATE TABLE IF NOT EXISTS inventory_items (
  id UUID PRIMARY KEY,
  public_id UUID NOT NULL UNIQUE,
  organization VARCHAR(10) NOT NULL CHECK (organization IN ('CBGC', 'CBCKL')),
  manager_main TEXT,
  manager_sub TEXT,
  management_no TEXT NOT NULL,
  item_type TEXT NOT NULL,
  acquired_date DATE,
  item_name TEXT NOT NULL,
  purchase_price BIGINT,
  useful_life_years INTEGER,
  storage_location TEXT,
  accessories TEXT,
  specification TEXT,
  classification_no TEXT,
  identification_no TEXT,
  photo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT inventory_items_organization_management_no_key UNIQUE (organization, management_no)
);
CREATE INDEX IF NOT EXISTS idx_inventory_items_org ON inventory_items (organization);
CREATE INDEX IF NOT EXISTS idx_inventory_items_name ON inventory_items (item_name);
