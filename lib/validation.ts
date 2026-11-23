import { z } from "zod";
import { normalizePurchasePrice } from "./purchase-price";

export const organizationSchema = z.enum(["CBGC", "CBCKL"]);

const nullableText = z.union([z.string().trim(), z.null()]).optional().transform((v) => {
  if (v == null || v === "") return null;
  return v;
});

const textOrEmpty = nullableText.transform(value => value ?? "");

const nullableNumber = z.union([z.number(), z.string().trim(), z.null()]).optional().transform((v) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n;
});

const nullableQuantity = z.preprocess((value) => {
  if (value == null || (typeof value === "string" && !value.trim())) return null;
  if (typeof value === "string") return Number(value.replaceAll(",", "").trim());
  return value;
}, z.number().int("수량은 정수로 입력해 주세요.")
  .min(0, "수량은 0 이상이어야 합니다.")
  .max(2147483647, "수량이 너무 큽니다.").nullable());

export const itemSchema = z.object({
  organization: organizationSchema,
  manager_main: nullableText,
  manager_sub: nullableText,
  management_no: z.string("관리번호는 필수입니다.").trim().min(1, "관리번호는 필수입니다."),
  item_type: textOrEmpty,
  acquired_date: nullableText,
  item_name: textOrEmpty,
  model_name: nullableText,
  purchase_price: z.union([z.number(), z.string()]).nullish().transform(normalizePurchasePrice),
  useful_life_years: nullableNumber,
  storage_location: nullableText,
  accessories: nullableText,
  specification: nullableText,
  classification_no: nullableText,
  identification_no: nullableText,
  photo_url: nullableText,
  unit: nullableText,
  quantity: nullableQuantity,
  item_status: nullableText,
});
