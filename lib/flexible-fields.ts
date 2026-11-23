export const FLEXIBLE_FIELDS = ["acquired_date", "useful_life_years", "quantity", "photo_url"] as const;
export type FlexibleField = typeof FLEXIBLE_FIELDS[number];

export function isStoredDate(value: string | null | undefined): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return year >= 100 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function normalizeAcquiredDate(value: string | null | undefined): string | null {
  const text = value?.trim();
  if (!text) return null;
  const match = text.match(/^(\d{4})[-./]\s*(\d{1,2})[-./]\s*(\d{1,2})(?:\.|T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/i);
  if (!match) return text;
  const date = match[1] + "-" + match[2].padStart(2, "0") + "-" + match[3].padStart(2, "0");
  if (!isStoredDate(date)) throw new Error("존재하는 날짜를 입력해 주세요.");
  return date;
}

/** Integers feed counts and lifecycle calculations. Fractions and notes retain their literal spelling. */
export function normalizeCount(value: string | number | null | undefined, maximum = 2147483647): number | string | null {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  const invalid = () => new Error("0 이상 " + maximum.toLocaleString("ko-KR") + " 이하의 수 또는 메모를 입력해 주세요.");
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0 || value > maximum) throw invalid();
    return Number.isInteger(value) ? value : text;
  }
  // A lone '-' and free-form notes are meaningful; malformed numeric entries still surface an error.
  if (!/\d/.test(text) || /[^\d,.+\-eE\s]/.test(text)) return text;
  if (!/^\+?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) throw invalid();
  const decimal = text.replaceAll(",", "");
  const number = Number(decimal);
  if (!Number.isFinite(number) || number > maximum) throw invalid();
  // Scientific notation on a text cell is an annotation, even if Number would round it to an integer.
  if (/e/i.test(decimal)) return text;
  const [whole, fraction = ""] = decimal.split(".");
  if (/[1-9]/.test(fraction)) {
    if (Number(whole) >= maximum) throw invalid();
    return text;
  }
  return number;
}

export function isPhotoUrl(value: string | null | undefined): value is string {
  if (!value || !/^https?:\/\/[^\s\\]+$/i.test(value)) return false;
  try {
    const url = new URL(value);
    const authority = value.replace(/^https?:\/\//i, "").split(/[/?#]/, 1)[0];
    return Boolean(url.hostname) && !authority.includes("@") && !url.username && !url.password;
  } catch { return false; }
}

export function normalizePhotoInput(value: string | null | undefined): string | null {
  const text = value?.trim();
  if (!text) return null;
  const scheme = text.replace(/[\u0000-\u0020]/g, "");
  if (!isPhotoUrl(text) && /^(?:[a-z][a-z0-9+.\-]*:|[\\/]{2}|https?[/\\])/i.test(scheme))
    throw new Error("물품사진URL은 http 또는 https 주소나 일반 메모를 입력해 주세요.");
  return text;
}

/** The SQL import and item CRUD paths must place each supplied value in exactly one column. */
export function isTextFieldValue(key: FlexibleField, value: string | number | null | undefined): value is string {
  if (typeof value !== "string") return false;
  if (key === "acquired_date") return !isStoredDate(value);
  if (key === "photo_url") return !isPhotoUrl(value);
  return true;
}
