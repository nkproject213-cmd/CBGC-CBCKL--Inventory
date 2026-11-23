/** Compare decimal spellings without converting their significant digits to floating point. */
function decimalKey(literal: string): string {
  const [coefficient, exponent = "0"] = literal.toLowerCase().split("e");
  const [whole, fraction = ""] = coefficient.replace(/^[+-]/, "").split(".");
  const digits = (whole + fraction).replace(/^0+/, "");
  if (!digits) return "0";
  const significant = digits.replace(/0+$/, "");
  const power = Number(exponent) - fraction.length + digits.length - significant.length;
  return (coefficient.startsWith("-") ? "-" : "") + significant + "e" + power;
}

const decimalAmount = /^[+-]?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

/** Keep a text price when a JS number would change its value, including legacy BIGINTs. */
export function normalizePurchasePrice(value: string | number | null | undefined): string | number | null {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (!decimalAmount.test(text)) return text;
  const decimal = text.replaceAll(",", "");
  const number = Number(decimal);
  if (!Number.isFinite(number) || (Number.isInteger(number) && !Number.isSafeInteger(number))) return text;
  if (decimalKey(decimal) !== decimalKey(String(number))) return text;
  return number === 0 ? 0 : number;
}
