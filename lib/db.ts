import "server-only";
import { neon } from "@neondatabase/serverless";
import type { InventoryItem, Organization, PublicInventoryItem } from "@/lib/types";

function sqlClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL 환경변수가 설정되지 않았습니다.");
  return neon(url);
}

function normalizeRows<T>(rows: unknown): T[] {
  return rows as T[];
}

export async function listItems(org: Organization, q = "", type = "") {
  const sql = sqlClient();
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
  const rows = await sql`SELECT * FROM inventory_items WHERE id = ${id} LIMIT 1`;
  return normalizeRows<InventoryItem>(rows)[0] ?? null;
}

export async function getPublicItem(publicId: string) {
  const sql = sqlClient();
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

export async function createItem(data: Omit<InventoryItem, "id" | "public_id" | "created_at" | "updated_at">) {
  const sql = sqlClient();
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

export async function updateItem(id: string, data: Omit<InventoryItem, "id" | "public_id" | "created_at" | "updated_at">) {
  const sql = sqlClient();
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
  const rows = await sql`DELETE FROM inventory_items WHERE id = ${id} RETURNING *`;
  return normalizeRows<InventoryItem>(rows)[0] ?? null;
}
