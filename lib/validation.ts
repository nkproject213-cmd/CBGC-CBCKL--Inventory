import { z } from "zod";

export const organizationSchema = z.enum(["CBGC", "CBCKL"]);

const nullableText = z.union([z.string().trim(), z.null()]).optional().transform((v) => {
  if (v == null || v === "") return null;
  return v;
});

const nullableNumber = z.union([z.number(), z.string(), z.null()]).optional().transform((v) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n;
});

export const itemSchema = z.object({
  organization: organizationSchema,
  manager_main: nullableText,
  manager_sub: nullableText,
  management_no: z.string().trim().min(1, "관리번호는 필수입니다."),
  item_type: z.string().trim().min(1, "물품유형은 필수입니다."),
  acquired_date: nullableText,
  item_name: z.string().trim().min(1, "품명은 필수입니다."),
  purchase_price: nullableNumber,
  useful_life_years: nullableNumber,
  storage_location: nullableText,
  accessories: nullableText,
  specification: nullableText,
  classification_no: nullableText,
  identification_no: nullableText,
  photo_url: nullableText,
});
