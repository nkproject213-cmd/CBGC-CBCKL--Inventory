export const EXPIRED_STATUS = "내용연수 경과";

export function koreaToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function usefulLifeEnd(acquired: string | null | undefined, years: number | null | undefined): string | null {
  if (!acquired || years == null || !Number.isInteger(years) || years < 0) return null;
  const match = acquired.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, y, m, d] = match.map(Number);
  const initial = new Date(Date.UTC(y, m - 1, d));
  if (y < 100 || initial.getUTCFullYear() !== y || initial.getUTCMonth() !== m - 1 || initial.getUTCDate() !== d || y + years > 9999) return null;
  // PostgreSQL and UI both clamp 29 February to 28 February in non-leap years.
  const last = new Date(Date.UTC(y + years, m, 0)).getUTCDate();
  return `${String(y + years).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

export function hasUsefulLifeExpired(acquired: string | null | undefined, years: number | null | undefined, today = koreaToday()): boolean {
  const end = usefulLifeEnd(acquired, years);
  return end !== null && end <= today;
}

const due = `(CASE WHEN i.acquired_date IS NOT NULL AND i.useful_life_years >= 0
  AND i.useful_life_years <= 9999 - EXTRACT(YEAR FROM i.acquired_date)
  AND EXTRACT(YEAR FROM i.acquired_date) >= 100
  THEN (i.acquired_date + make_interval(years => i.useful_life_years))::date
    <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::date ELSE FALSE END)`;

// Update only rows whose effective status changes. No repeated timestamp churn.
// Organization/id are bound parameters; item IDs, photos and all other values stay intact.
export const SYNC_LIFE_STATUS_SQL = `
UPDATE inventory_items AS i SET
  item_status = CASE WHEN ${due} THEN '내용연수 경과'
    WHEN i.life_expiry_auto AND i.item_status = '내용연수 경과' THEN i.status_before_life_expiry
    ELSE i.item_status END,
  status_before_life_expiry = CASE WHEN ${due} THEN
    CASE WHEN NOT i.life_expiry_auto OR i.item_status IS DISTINCT FROM '내용연수 경과'
      THEN NULLIF(i.item_status, '내용연수 경과') ELSE i.status_before_life_expiry END
    ELSE NULL END,
  life_expiry_auto = ${due},
  updated_at = NOW()
WHERE ($1::text IS NULL OR i.organization = $1)
  AND ($2::uuid IS NULL OR i.id = $2::uuid)
  AND ((${due} AND (NOT i.life_expiry_auto OR i.item_status IS DISTINCT FROM '내용연수 경과'))
    OR (NOT ${due} AND i.life_expiry_auto))
RETURNING i.id`;
