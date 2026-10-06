import "server-only";
import { neon } from "@neondatabase/serverless";
import type { InventoryItem, Organization, PublicInventoryItem } from "@/lib/types";

let schemaReady: Promise<void> | null = null;

function sqlClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL 환경변수가 설정되지 않았습니다.");
  return neon(url);
}

type SqlClient = ReturnType<typeof sqlClient>;

async function ensureSchema(sql: SqlClient) {
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql`
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
          CONSTRAINT inventory_items_organization_management_no_key
            UNIQUE (organization, management_no)
        )
      `;

      await sql`
        CREATE INDEX IF NOT EXISTS idx_inventory_items_org
        ON inventory_items (organization)
      `;

      await sql`
        CREATE INDEX IF NOT EXISTS idx_inventory_items_name
        ON inventory_items (item_name)
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS inventory_settings (
          organization VARCHAR(10) PRIMARY KEY CHECK (organization IN ('CBGC', 'CBCKL')),
          label_image_url TEXT,
          label_image_scale INTEGER NOT NULL DEFAULT 80 CHECK (label_image_scale BETWEEN 20 AND 100),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
    })();
  }

  await schemaReady;
}

function normalizeRows<T>(rows: unknown): T[] {
  return rows as T[];
}

export async function listItems(org: Organization, q = "", type = "") {
  const sql = sqlClient();
  await ensureSchema(sql);

  const query = `%${q.trim()}%`;
  const rows = await sql`
    SELECT * FROM inventory_items
    WHERE organization = ${org}
      AND (${q.trim()} = '' OR (
        management_no ILIKE ${query}
        OR item_name ILIKE ${query}
        OR COALESCE(storage_location, '') ILIKE ${query}
        OR COALESCE(manager_main, '') ILIKE ${query}
        OR COALESCE(manager_sub, '') ILIKE ${query}
        OR COALESCE(classification_no, '') ILIKE ${query}
        OR COALESCE(identification_no, '') ILIKE ${query}
      ))
      AND (${type} = '' OR item_type = ${type})
    ORDER BY created_at DESC
  `;
  return normalizeRows<InventoryItem>(rows);
}

export async function getItem(id: string) {
  const sql = sqlClient();
  await ensureSchema(sql);

  const rows = await sql`SELECT * FROM inventory_items WHERE id = ${id} LIMIT 1`;
  return normalizeRows<InventoryItem>(rows)[0] ?? null;
}

export async function getPublicItem(publicId: string) {
  const sql = sqlClient();
  await ensureSchema(sql);

  const rows = await sql`
    SELECT
      public_id, organization, manager_main, manager_sub, management_no,
      acquired_date, item_name, storage_location, specification, photo_url
    FROM inventory_items
    WHERE public_id = ${publicId}
    LIMIT 1
  `;
  return normalizeRows<PublicInventoryItem>(rows)[0] ?? null;
}

export async function createItem(
  data: Omit<InventoryItem, "id" | "public_id" | "created_at" | "updated_at">
) {
  const sql = sqlClient();
  await ensureSchema(sql);

  const id = crypto.randomUUID();
  const publicId = crypto.randomUUID();
  const rows = await sql`
    INSERT INTO inventory_items (
      id, public_id, organization, manager_main, manager_sub, management_no,
      item_type, acquired_date, item_name, purchase_price, useful_life_years,
      storage_location, accessories, specification, classification_no,
      identification_no, photo_url
    ) VALUES (
      ${id}, ${publicId}, ${data.organization}, ${data.manager_main}, ${data.manager_sub}, ${data.management_no},
      ${data.item_type}, ${data.acquired_date}, ${data.item_name}, ${data.purchase_price}, ${data.useful_life_years},
      ${data.storage_location}, ${data.accessories}, ${data.specification}, ${data.classification_no},
      ${data.identification_no}, ${data.photo_url}
    )
    RETURNING *
  `;
  return normalizeRows<InventoryItem>(rows)[0];
}

export async function updateItem(
  id: string,
  data: Omit<InventoryItem, "id" | "public_id" | "created_at" | "updated_at">
) {
  const sql = sqlClient();
  await ensureSchema(sql);

  const rows = await sql`
    UPDATE inventory_items SET
      organization = ${data.organization},
      manager_main = ${data.manager_main},
      manager_sub = ${data.manager_sub},
      management_no = ${data.management_no},
      item_type = ${data.item_type},
      acquired_date = ${data.acquired_date},
      item_name = ${data.item_name},
      purchase_price = ${data.purchase_price},
      useful_life_years = ${data.useful_life_years},
      storage_location = ${data.storage_location},
      accessories = ${data.accessories},
      specification = ${data.specification},
      classification_no = ${data.classification_no},
      identification_no = ${data.identification_no},
      photo_url = ${data.photo_url},
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;
  return normalizeRows<InventoryItem>(rows)[0] ?? null;
}

export async function deleteItem(id: string) {
  const sql = sqlClient();
  await ensureSchema(sql);

  const rows = await sql`DELETE FROM inventory_items WHERE id = ${id} RETURNING *`;
  return normalizeRows<InventoryItem>(rows)[0] ?? null;
}


export async function getLabelSettings(org: Organization) {
  const sql = sqlClient();
  await ensureSchema(sql);

  const rows = await sql`
    SELECT organization, label_image_url, label_image_scale, updated_at
    FROM inventory_settings
    WHERE organization = ${org}
    LIMIT 1
  `;

  return normalizeRows<{
    organization: Organization;
    label_image_url: string | null;
    label_image_scale: number;
    updated_at: string;
  }>(rows)[0] ?? {
    organization: org,
    label_image_url: null,
    label_image_scale: 80,
    updated_at: new Date(0).toISOString(),
  };
}

export async function saveLabelSettings(
  org: Organization,
  labelImageUrl: string | null,
  labelImageScale: number
) {
  const sql = sqlClient();
  await ensureSchema(sql);

  const rows = await sql`
    INSERT INTO inventory_settings (
      organization, label_image_url, label_image_scale, updated_at
    ) VALUES (
      ${org}, ${labelImageUrl}, ${labelImageScale}, NOW()
    )
    ON CONFLICT (organization) DO UPDATE SET
      label_image_url = EXCLUDED.label_image_url,
      label_image_scale = EXCLUDED.label_image_scale,
      updated_at = NOW()
    RETURNING organization, label_image_url, label_image_scale, updated_at
  `;

  return normalizeRows<{
    organization: Organization;
    label_image_url: string | null;
    label_image_scale: number;
    updated_at: string;
  }>(rows)[0];
}


export async function updateManagersForOrg(
  org: Organization,
  managerMain: string | null,
  managerSub: string | null
) {
  const sql = sqlClient();
  await ensureSchema(sql);

  let rows: unknown;
  if (managerMain && managerSub) {
    rows = await sql`
      UPDATE inventory_items
      SET manager_main = ${managerMain}, manager_sub = ${managerSub}, updated_at = NOW()
      WHERE organization = ${org}
      RETURNING id
    `;
  } else if (managerMain) {
    rows = await sql`
      UPDATE inventory_items
      SET manager_main = ${managerMain}, updated_at = NOW()
      WHERE organization = ${org}
      RETURNING id
    `;
  } else if (managerSub) {
    rows = await sql`
      UPDATE inventory_items
      SET manager_sub = ${managerSub}, updated_at = NOW()
      WHERE organization = ${org}
      RETURNING id
    `;
  } else {
    return 0;
  }

  return normalizeRows<{ id: string }>(rows).length;
}


export async function deleteItemsForOrg(org: Organization) {
  const sql = sqlClient();
  await ensureSchema(sql);

  const rows = await sql`
    DELETE FROM inventory_items
    WHERE organization = ${org}
    RETURNING id
  `;

  return normalizeRows<{ id: string }>(rows).length;
}
