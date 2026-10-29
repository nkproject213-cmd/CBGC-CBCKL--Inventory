import type * as ExcelJS from "exceljs";
import type { Organization } from "./types";

// These literal column names, never user input, are also the SQL allowlist.
export const IMPORT_COLUMNS = {
  "관리책임자(정)": "manager_main", "관리책임자(부)": "manager_sub",
  "물품유형": "item_type", "취득일자": "acquired_date", "품명": "item_name", "모델명": "model_name",
  "구매단가": "purchase_price", "내용년수": "useful_life_years",
  "보관장소": "storage_location", "기타구성품": "accessories", "규격": "specification",
  "물품분류번호": "classification_no", "물품식별번호": "identification_no",
  "물품사진URL": "photo_url", "단위": "unit", "수량": "quantity", "상태": "item_status",
} as const;
type ImportKey = typeof IMPORT_COLUMNS[keyof typeof IMPORT_COLUMNS];
export type ImportPatch = Partial<Record<ImportKey, string | number>>;
export type ImportRow = { row: number; management_no: string; patch: ImportPatch };
export type ImportPlan = { updates: ImportRow[]; creates: ImportRow[]; errors: string[]; skipped: number };
type Primitive = string | number | Date | null;
export type ImportQuery = (text: string, values: unknown[]) => Promise<Array<Record<string, unknown>>>;
export const IMPORT_LIMIT = 5000;
const KEYS = Object.values(IMPORT_COLUMNS);
const hasValue = (value: Primitive) => value !== null && (typeof value !== "string" || value.trim() !== "");

function cellValue(cell: ExcelJS.Cell, header: string): Primitive {
  let value: unknown = cell.value;
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const object = value as Record<string, unknown>;
    if ("formula" in object || "sharedFormula" in object) {
      if (!("result" in object) || object.result === undefined) throw new Error(`${header}: 수식 결과가 없습니다. 값으로 붙여넣어 주세요.`);
      value = object.result;
    } else if (Array.isArray(object.richText)) {
      value = object.richText.map((part: { text: string }) => part.text).join("");
    } else if ("hyperlink" in object) {
      value = header === "물품사진URL" ? object.hyperlink : object.text;
    }
  }
  if (value == null) return null;
  if (typeof value === "string" || value instanceof Date) return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    // Preserve simple zero-padded identifiers, including numeric model codes.
    if (["관리번호", "모델명", "물품분류번호", "물품식별번호"].includes(header)) {
      if (!Number.isSafeInteger(value)) throw new Error(`${header}: 번호를 텍스트 형식으로 입력해 주세요.`);
      if (/^0+$/.test(cell.numFmt || "")) return String(value).padStart(cell.numFmt.length, "0");
    }
    return value;
  }
  throw new Error(`${header}: 오류 또는 지원하지 않는 셀 값입니다. 값을 확인해 주세요.`);
}

export function importDate(value: Primitive, date1904 = false): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error("취득일자: 올바른 날짜가 아닙니다.");
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number") {
    const day = Math.floor(value);
    if (day < (date1904 ? 0 : 1) || (!date1904 && day === 60) || day > 2957000) throw new Error("취득일자: 올바른 엑셀 날짜가 아닙니다.");
    const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 31);
    return new Date(epoch + (date1904 || day < 60 ? day : day - 1) * 86400000).toISOString().slice(0, 10);
  }
  const match = String(value ?? "").trim().match(/^(\d{4})[-./]\s*(\d{1,2})[-./]\s*(\d{1,2})(?:\.|T\d{2}:\d{2}.*)?$/);
  if (!match) throw new Error("취득일자: YYYY-MM-DD 형식으로 입력해 주세요.");
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (Number(y) < 100 || date.getUTCFullYear() !== Number(y) || date.getUTCMonth() !== Number(m) - 1 || date.getUTCDate() !== Number(d)) throw new Error("취득일자: 존재하지 않는 날짜입니다.");
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function convert(value: Primitive, header: string, key: ImportKey, date1904: boolean): string | number {
  if (key === "acquired_date") return importDate(value, date1904);
  if (["quantity", "purchase_price", "useful_life_years"].includes(key)) {
    if (typeof value === "string" && !/^[+]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.0+)?$/.test(value.trim())) throw new Error(`${header}: 0 이상의 정수로 입력해 주세요.`);
    const number = typeof value === "number" ? value : Number(String(value).replaceAll(",", ""));
    const maximum = key === "purchase_price" ? Number.MAX_SAFE_INTEGER : 2147483647;
    if (value instanceof Date || !Number.isSafeInteger(number) || number < 0 || number > maximum) throw new Error(`${header}: 0 이상 ${maximum} 이하의 정수로 입력해 주세요.`);
    return number;
  }
  if (value instanceof Date) throw new Error(`${header}: 날짜가 아닌 텍스트로 입력해 주세요.`);
  const text = String(value).trim();
  if (text.length > 20000) throw new Error(`${header}: 값이 너무 깁니다.`);
  if (key === "photo_url") {
    try { const url = new URL(text); if (!["http:", "https:"].includes(url.protocol)) throw new Error(); }
    catch { throw new Error("물품사진URL: http 또는 https 이미지 주소를 입력해 주세요."); }
  }
  return text;
}

export function planImport(sheet: ExcelJS.Worksheet, existing: ReadonlySet<string>, date1904 = false): ImportPlan {
  if (sheet.rowCount > IMPORT_LIMIT + 1) throw new Error(`한 번에 ${IMPORT_LIMIT.toLocaleString()}행까지 업로드할 수 있습니다.`);
  const headers = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, column) => {
    let name = cell.text.trim().replace(/\s+/g, "");
    if (name === "위치" || name === "위치(보관장소)") name = "보관장소";
    if (name === "내용연수") name = "내용년수";
    if (name !== "관리번호" && !Object.hasOwn(IMPORT_COLUMNS, name)) return;
    if (headers.has(name)) throw new Error(`중복된 열 제목입니다: ${name}`);
    headers.set(name, column);
  });
  if (!headers.has("관리번호")) throw new Error("필수 열이 없습니다: 관리번호");
  const plan: ImportPlan = { updates: [], creates: [], errors: [], skipped: 0 };
  const candidates: Array<{ row: number; management_no: string; values: Map<string, Primitive>; error?: string }> = [];
  const counts = new Map<string, number>();
  for (let number = 2; number <= sheet.rowCount; number++) {
    const row = sheet.getRow(number);
    const values = new Map<string, Primitive>();
    let managementNo = "";
    let error: string | undefined;
    try {
      const key = cellValue(row.getCell(headers.get("관리번호")!), "관리번호");
      if (key instanceof Date) throw new Error("관리번호: 날짜가 아닌 텍스트로 입력해 주세요.");
      managementNo = key == null ? "" : String(key).trim();
      values.set("관리번호", key);
      for (const [header, column] of headers) {
        if (header !== "관리번호") values.set(header, cellValue(row.getCell(column), header));
      }
    } catch (e) { error = e instanceof Error ? e.message : "셀을 확인해 주세요."; }
    if (!error && ![...values.values()].some(hasValue)) { plan.skipped++; continue; }
    if (managementNo) counts.set(managementNo, (counts.get(managementNo) || 0) + 1);
    candidates.push({ row: number, management_no: managementNo, values, error });
  }
  for (const candidate of candidates) {
    const { row, management_no, values } = candidate;
    try {
      if (!management_no) throw new Error(candidate.error || "관리번호를 입력해 주세요.");
      if ((counts.get(management_no) || 0) > 1) throw new Error(`관리번호 '${management_no}'가 파일 안에 중복되어 해당 번호의 행은 모두 제외했습니다.`);
      if (candidate.error) throw new Error(candidate.error);
      const patch: ImportPatch = {};
      for (const [header, key] of Object.entries(IMPORT_COLUMNS)) {
        const value = values.get(header) ?? null;
        if (hasValue(value)) patch[key] = convert(value, header, key, date1904);
      }
      if (existing.has(management_no)) plan.updates.push({ row, management_no, patch });
      else {
        if (!patch.item_type || !patch.item_name) throw new Error("신규 관리번호입니다. 신규 등록에는 물품유형과 품명이 필요합니다.");
        plan.creates.push({ row, management_no, patch });
      }
    } catch (e) { plan.errors.push(`${row}행: ${e instanceof Error ? e.message : "입력값을 확인해 주세요."}`); }
  }
  return plan;
}

const merged = KEYS.map(key => `COALESCE(p.${key}, i.${key})`);
// Missing JSON fields become SQL NULL. COALESCE preserves the CURRENT database
// value, not a stale read/merge snapshot, including concurrent edits to other fields.
export const UPDATE_IMPORT_SQL = `
WITH incoming AS (SELECT * FROM jsonb_populate_recordset(NULL::inventory_items, $2::jsonb)),
changed AS (
  UPDATE inventory_items AS i SET
    ${KEYS.map((key, index) => `${key} = ${merged[index]}`).join(",\n    ")},
    updated_at = NOW()
  FROM incoming AS p
  WHERE i.organization = $1 AND i.management_no = p.management_no
    AND ROW(${merged.join(", ")}) IS DISTINCT FROM ROW(${KEYS.map(key => `i.${key}`).join(", ")})
  RETURNING i.management_no
)
SELECT p.management_no,
  CASE WHEN c.management_no IS NOT NULL THEN 'updated'
       WHEN EXISTS (SELECT 1 FROM inventory_items AS e WHERE e.organization = $1 AND e.management_no = p.management_no)
       THEN 'unchanged' ELSE 'missing' END AS action
FROM incoming AS p LEFT JOIN changed AS c ON c.management_no = p.management_no`;

export const INSERT_IMPORT_SQL = `
WITH incoming AS (SELECT * FROM jsonb_populate_recordset(NULL::inventory_items, $2::jsonb))
INSERT INTO inventory_items (id, public_id, organization, management_no, ${KEYS.join(", ")})
SELECT gen_random_uuid(), gen_random_uuid(), $1, p.management_no, ${KEYS.map(key => `p.${key}`).join(", ")} FROM incoming AS p
ON CONFLICT (organization, management_no) DO NOTHING
RETURNING management_no, 'created'::text AS action`;

function payload(rows: ImportRow[]) {
  return JSON.stringify(rows.map(row => {
    const data: Record<string, string | number> = { management_no: row.management_no };
    for (const key of KEYS) {
      const value = row.patch[key];
      if (value !== undefined && value !== null && String(value).trim() !== "") data[key] = value;
    }
    return data;
  }));
}

export async function executeImport(plan: ImportPlan, org: Organization, query: ImportQuery) {
  const errors = [...plan.errors];
  const actionsByRow = new Map<number, "created" | "updated" | "unchanged">();
  const saveAction = (row: number, action: "created" | "updated" | "unchanged") => {
    const before = actionsByRow.get(row);
    if (before === "created" || (before === "updated" && action === "unchanged")) return;
    actionsByRow.set(row, action);
  };
  async function update(rows: ImportRow[]) {
    const responses = await query(UPDATE_IMPORT_SQL, [org, payload(rows)]);
    const actions = new Map(responses.map(value => [String(value.management_no), value.action]));
    for (const row of rows) {
      const action = actions.get(row.management_no);
      if (action === "updated") saveAction(row.row, "updated");
      else if (action === "unchanged") saveAction(row.row, "unchanged");
      else errors.push(`${row.row}행: 수정할 물품이 없어졌습니다. 목록을 확인해 주세요.`);
    }
  }
  async function apply(rows: ImportRow[], create: boolean) {
    if (!create) { await update(rows); return; }
    const inserted = await query(INSERT_IMPORT_SQL, [org, payload(rows)]);
    const created = new Set(inserted.map(value => String(value.management_no)));
    for (const row of rows) if (created.has(row.management_no)) saveAction(row.row, "created");
    const conflicts = rows.filter(row => !created.has(row.management_no));
    // A concurrent upload may have inserted the key. Update only this file's
    // supplied cells; never replace the row or regenerate its existing QR ID.
    if (conflicts.length) await update(conflicts);
  }
  for (const [rows, create] of [[plan.updates, false], [plan.creates, true]] as const) {
    for (let index = 0; index < rows.length; index += 50) {
      const batch = rows.slice(index, index + 50);
      try { await apply(batch, create); }
      catch {
        // A database error rolls back that SQL statement; isolate a bad row.
        for (const row of batch) {
          try { await apply([row], create); }
          catch { errors.push(`${row.row}행: 데이터 저장에 실패했습니다. 입력값을 확인하고 다시 업로드해 주세요.`); }
        }
      }
    }
  }
  const actions = [...actionsByRow.values()];
  return {
    created: actions.filter(action => action === "created").length,
    updated: actions.filter(action => action === "updated").length,
    unchanged: actions.filter(action => action === "unchanged").length,
    skipped: plan.skipped, failed: errors.length, errors: errors.slice(0, 30),
  };
}
