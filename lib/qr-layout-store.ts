import "server-only";
import { neon } from "@neondatabase/serverless";
import type { Organization } from "./types";
import { getLabelSettings } from "./db";
import { defaultLayout, parseLayout, safeImageUrl, type QrLayout } from "./qr-layout";

let ready: Promise<void> | null = null;
function client() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing");
  return neon(process.env.DATABASE_URL);
}
async function ensureStore() {
  if (!ready) ready = (async () => {
    const sql = client();
    await sql`CREATE TABLE IF NOT EXISTS inventory_qr_layouts (
      organization VARCHAR(10) PRIMARY KEY CHECK (organization IN ('CBGC','CBCKL')),
      layout JSONB NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  })().catch(error => { ready = null; throw error; });
  await ready;
}
export type StoredLayout = { layout: QrLayout; revision: number; updated_at: string | null };
export async function getQrLayout(org: Organization): Promise<StoredLayout> {
  await ensureStore();
  const sql = client();
  const rows = await sql`SELECT layout, revision, updated_at FROM inventory_qr_layouts WHERE organization = ${org}`;
  const row = rows[0];
  if (row) return { layout: parseLayout(row.layout), revision: Number(row.revision), updated_at: new Date(row.updated_at).toISOString() };
  const layout = defaultLayout();
  // Reuse an already uploaded common image without mutating legacy settings.
  const previous = await getLabelSettings(org);
  const url = safeImageUrl(previous.label_image_url);
  if (url) { layout.image.source = "custom"; layout.image.url = url; }
  return { layout, revision: 0, updated_at: null };
}
export class LayoutConflict extends Error {}
export async function saveQrLayout(org: Organization, input: unknown, expectedRevision: number): Promise<StoredLayout> {
  const layout = parseLayout(input);
  await ensureStore();
  const sql = client();
  const data = JSON.stringify(layout);
  // Compare-and-set prevents two browser tabs from silently overwriting each other.
  const rows = expectedRevision === 0
    ? await sql`INSERT INTO inventory_qr_layouts (organization, layout, revision)
        VALUES (${org}, ${data}::jsonb, 1) ON CONFLICT (organization) DO NOTHING
        RETURNING layout, revision, updated_at`
    : await sql`UPDATE inventory_qr_layouts SET layout = ${data}::jsonb, revision = revision + 1, updated_at = NOW()
        WHERE organization = ${org} AND revision = ${expectedRevision}
        RETURNING layout, revision, updated_at`;
  const row = rows[0];
  if (!row) throw new LayoutConflict("다른 창에서 레이아웃이 변경되었습니다. 새로고침 후 다시 편집해 주세요.");
  return { layout: parseLayout(row.layout), revision: Number(row.revision), updated_at: new Date(row.updated_at).toISOString() };
}
