import "server-only";
import { isPhotoUrl, isTextFieldValue, type FlexibleField } from "./flexible-fields";
import { normalizePurchasePrice } from "./purchase-price";
import { neon } from "@neondatabase/serverless";
import type { InventoryItem, Organization, PublicInventoryItem } from "@/lib/types";
import { SYNC_LIFE_STATUS_SQL } from "@/lib/lifecycle";

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
          purchase_price TEXT,
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
        )
      `;
      await sql`
        ALTER TABLE inventory_items
          ADD COLUMN IF NOT EXISTS unit TEXT,
          ADD COLUMN IF NOT EXISTS quantity INTEGER CHECK (quantity >= 0),
          ADD COLUMN IF NOT EXISTS item_status TEXT,
          ADD COLUMN IF NOT EXISTS model_name TEXT,
          ADD COLUMN IF NOT EXISTS life_expiry_auto BOOLEAN NOT NULL DEFAULT FALSE,
          ADD COLUMN IF NOT EXISTS status_before_life_expiry TEXT,
          ADD COLUMN IF NOT EXISTS acquired_date_text TEXT,
          ADD COLUMN IF NOT EXISTS useful_life_years_text TEXT,
          ADD COLUMN IF NOT EXISTS quantity_text TEXT,
          ADD COLUMN IF NOT EXISTS photo_url_text TEXT
      `;
      await sql`CREATE INDEX IF NOT EXISTS idx_inventory_items_org ON inventory_items (organization)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_inventory_items_name ON inventory_items (item_name)`;
      await sql`
        CREATE TABLE IF NOT EXISTS inventory_settings (
          organization VARCHAR(10) PRIMARY KEY CHECK (organization IN ('CBGC', 'CBCKL')),
          label_image_url TEXT,
          label_image_scale INTEGER NOT NULL DEFAULT 80 CHECK (label_image_scale BETWEEN 20 AND 100),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
    })().catch(error => { schemaReady = null; throw error; });
  }
  await schemaReady;
}
function normalizeRows<T>(rows: unknown): T[] { return rows as T[]; }

type StoredItem = Omit<InventoryItem, "acquired_date"> & {
  acquired_date: string | Date | null;
  acquired_date_text: string | null;
  useful_life_years_text: string | null;
  quantity_text: string | null;
};
function inventoryRows(rows: unknown): InventoryItem[] {
  return normalizeRows<StoredItem>(rows).map(({ acquired_date_text, useful_life_years_text, quantity_text, ...item }) => ({
    ...item,
    acquired_date: item.acquired_date instanceof Date ? item.acquired_date.toISOString().slice(0, 10) : (item.acquired_date ?? acquired_date_text),
    useful_life_years: item.useful_life_years ?? useful_life_years_text,
    quantity: item.quantity ?? quantity_text,
    photo_url: isPhotoUrl(item.photo_url) ? item.photo_url : null,
    photo_url_text: isPhotoUrl(item.photo_url) ? null : (item.photo_url_text ?? item.photo_url),
    purchase_price: normalizePurchasePrice(item.purchase_price),
  }));
}

function storedParts(key: FlexibleField, value: string | number | null) {
  return isTextFieldValue(key, value) ? { value: null, note: value } : { value, note: null };
}

function itemParts(item: Pick<InventoryItem, FlexibleField>) {
  return {
    date: storedParts("acquired_date", item.acquired_date),
    life: storedParts("useful_life_years", item.useful_life_years),
    quantity: storedParts("quantity", item.quantity),
    photo: storedParts("photo_url", item.photo_url),
  };
}

export async function syncExpiredStatuses(org: Organization | null = null, id: string | null = null) {
  const sql = sqlClient();
  await ensureSchema(sql);
  const rows = await sql.query(SYNC_LIFE_STATUS_SQL, [org, id]);
  return normalizeRows<{ id: string }>(rows).length;
}

export async function listItems(org: Organization, q = "", type = "") {
  const sql = sqlClient();
  await ensureSchema(sql);
  // Reconcile against the current Korean date on every admin list/export/print read.
  await sql.query(SYNC_LIFE_STATUS_SQL, [org, null]);
  const query = `%${q.trim()}%`;
  const rows = await sql`
    SELECT inventory_items.*, TO_CHAR(acquired_date, 'YYYY-MM-DD') AS acquired_date
    FROM inventory_items
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
  return inventoryRows(rows);
}
export async function getItem(id: string) {
  const sql = sqlClient();
  await ensureSchema(sql);
  await sql.query(SYNC_LIFE_STATUS_SQL, [null, id]);
  const rows = await sql`SELECT inventory_items.*, TO_CHAR(acquired_date, 'YYYY-MM-DD') AS acquired_date FROM inventory_items WHERE id = ${id} LIMIT 1`;
  return inventoryRows(rows)[0] ?? null;
}
export async function getPublicItem(publicId: string) {
  const sql = sqlClient();
  await ensureSchema(sql);
  const rows = await sql`
    SELECT public_id, organization, manager_main, manager_sub, management_no,
      COALESCE(TO_CHAR(acquired_date, 'YYYY-MM-DD'), acquired_date_text) AS acquired_date,
      item_name, model_name, storage_location, specification, photo_url
    FROM inventory_items WHERE public_id = ${publicId} LIMIT 1
  `;
  const item = normalizeRows<PublicInventoryItem>(rows)[0];
  return item ? { ...item, photo_url: isPhotoUrl(item.photo_url) ? item.photo_url : null } : null;
}
export async function createItem(data: Omit<InventoryItem, "id" | "public_id" | "created_at" | "updated_at">) {
  const sql = sqlClient();
  await ensureSchema(sql);
  const parts = itemParts(data);
  const id = crypto.randomUUID(); const publicId = crypto.randomUUID();
  await sql`
    INSERT INTO inventory_items (
      id, public_id, organization, manager_main, manager_sub, management_no,
      item_type, acquired_date, item_name, model_name, purchase_price, useful_life_years,
      storage_location, accessories, specification, classification_no,
      identification_no, photo_url, unit, quantity, item_status,
      acquired_date_text, useful_life_years_text, quantity_text, photo_url_text
    ) VALUES (
      ${id}, ${publicId}, ${data.organization}, ${data.manager_main}, ${data.manager_sub}, ${data.management_no},
      ${data.item_type}, ${parts.date.value}, ${data.item_name}, ${data.model_name ?? null}, ${data.purchase_price}, ${parts.life.value},
      ${data.storage_location}, ${data.accessories}, ${data.specification}, ${data.classification_no},
      ${data.identification_no}, ${parts.photo.value}, ${data.unit ?? null}, ${parts.quantity.value}, ${data.item_status ?? null},
      ${parts.date.note}, ${parts.life.note}, ${parts.quantity.note}, ${parts.photo.note}
    )
  `;
  const item = await getItem(id);
  if (!item) throw new Error("등록한 물품을 불러오지 못했습니다.");
  return item;
}
export async function updateItem(id: string, data: Omit<InventoryItem, "id" | "public_id" | "created_at" | "updated_at">) {
  const sql = sqlClient();
  await ensureSchema(sql);
  const parts = itemParts(data);
  const rows = await sql`
    UPDATE inventory_items SET
      organization = ${data.organization},
      manager_main = ${data.manager_main},
      manager_sub = ${data.manager_sub},
      management_no = ${data.management_no},
      item_type = ${data.item_type},
      acquired_date = ${parts.date.value},
      acquired_date_text = ${parts.date.note},
      item_name = ${data.item_name},
      model_name = ${data.model_name ?? null},
      purchase_price = ${data.purchase_price},
      useful_life_years = ${parts.life.value},
      useful_life_years_text = ${parts.life.note},
      storage_location = ${data.storage_location},
      accessories = ${data.accessories},
      specification = ${data.specification},
      classification_no = ${data.classification_no},
      identification_no = ${data.identification_no},
      photo_url = ${parts.photo.value},
      photo_url_text = ${parts.photo.note},
      unit = ${data.unit ?? null},
      quantity = ${parts.quantity.value},
      quantity_text = ${parts.quantity.note},
      item_status = ${data.item_status ?? null},
      updated_at = NOW()
    WHERE id = ${id} RETURNING id
  `;
  return normalizeRows<{id: string}>(rows).length ? getItem(id) : null;
}
export async function deleteItem(id: string) {
  const sql = sqlClient(); await ensureSchema(sql);
  const rows = await sql`DELETE FROM inventory_items WHERE id = ${id} RETURNING *`;
  return inventoryRows(rows)[0] ?? null;
}
export async function getLabelSettings(org: Organization) {
  const sql = sqlClient(); await ensureSchema(sql);
  const rows = await sql`SELECT organization, label_image_url, label_image_scale, updated_at FROM inventory_settings WHERE organization = ${org} LIMIT 1`;
  return normalizeRows<{ organization: Organization; label_image_url: string | null; label_image_scale: number; updated_at: string }>(rows)[0] ?? {
    organization: org, label_image_url: null, label_image_scale: 80, updated_at: new Date(0).toISOString(),
  };
}
export async function saveLabelSettings(org: Organization, labelImageUrl: string | null, labelImageScale: number) {
  const sql = sqlClient(); await ensureSchema(sql);
  const rows = await sql`
    INSERT INTO inventory_settings (organization, label_image_url, label_image_scale, updated_at)
    VALUES (${org}, ${labelImageUrl}, ${labelImageScale}, NOW())
    ON CONFLICT (organization) DO UPDATE SET label_image_url = EXCLUDED.label_image_url,
      label_image_scale = EXCLUDED.label_image_scale, updated_at = NOW()
    RETURNING organization, label_image_url, label_image_scale, updated_at
  `;
  return normalizeRows<{ organization: Organization; label_image_url: string | null; label_image_scale: number; updated_at: string }>(rows)[0];
}
export async function updateManagersForOrg(org: Organization, managerMain: string | null, managerSub: string | null) {
  const sql = sqlClient(); await ensureSchema(sql); let rows: unknown;
  if (managerMain && managerSub) rows = await sql`UPDATE inventory_items SET manager_main = ${managerMain}, manager_sub = ${managerSub}, updated_at = NOW() WHERE organization = ${org} RETURNING id`;
  else if (managerMain) rows = await sql`UPDATE inventory_items SET manager_main = ${managerMain}, updated_at = NOW() WHERE organization = ${org} RETURNING id`;
  else if (managerSub) rows = await sql`UPDATE inventory_items SET manager_sub = ${managerSub}, updated_at = NOW() WHERE organization = ${org} RETURNING id`;
  else return 0;
  return normalizeRows<{ id: string }>(rows).length;
}
export async function deleteItemsForOrg(org: Organization) {
  const sql = sqlClient(); await ensureSchema(sql);
  const rows = await sql`DELETE FROM inventory_items WHERE organization = ${org} RETURNING id`;
  return normalizeRows<{ id: string }>(rows).length;
}
export async function deleteItemsByIdsForOrg(org: Organization, ids: string[]) {
  if (!ids.length) return 0;
  const sql = sqlClient(); await ensureSchema(sql);
  const rows = await sql`DELETE FROM inventory_items WHERE organization = ${org} AND id = ANY(${ids}::uuid[]) RETURNING id`;
  return normalizeRows<{ id: string }>(rows).length;
}

export async function updatePhotoForItems(org: Organization, ids: string[], photoUrl: string) {
  const sql = sqlClient();
  await ensureSchema(sql);
  const rows = await sql`
    WITH selected AS MATERIALIZED (
      SELECT id FROM inventory_items
      WHERE organization = ${org} AND id = ANY(${ids}::uuid[])
      ORDER BY id
      FOR UPDATE
    ), changed AS (
      UPDATE inventory_items AS i SET
        photo_url = ${photoUrl},
        photo_url_text = NULL,
        updated_at = NOW()
      FROM selected AS s
      WHERE i.id = s.id
        AND (SELECT COUNT(*) FROM selected) = ${ids.length}
        AND (i.photo_url IS DISTINCT FROM ${photoUrl} OR i.photo_url_text IS NOT NULL)
      RETURNING i.id
    )
    SELECT (SELECT COUNT(*)::int FROM selected) AS total,
      (SELECT COUNT(*)::int FROM changed) AS updated
  `;
  const result = normalizeRows<{ total: number; updated: number }>(rows)[0];
  // Locked selection and update share one statement, so a removed/moved item
  // rejects the whole batch. Replays of the same photo leave timestamps intact.
  if (result.total !== ids.length) return null;
  return { updated: result.updated, unchanged: result.total - result.updated, total: result.total };
}
