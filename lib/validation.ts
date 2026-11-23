import { z } from "zod";
import { normalizeAcquiredDate, normalizeCount, normalizePhotoInput } from "./flexible-fields";
import { normalizePurchasePrice } from "./purchase-price";

export const organizationSchema = z.enum(["CBGC", "CBCKL"]);

const nullableText = z.union([z.string().trim(), z.null()]).optional().transform((v) => {
  if (v == null || v === "") return null;
  return v;
});

const textOrEmpty = nullableText.transform(value => value ?? "");

function checked<T, R>(normalize: (value: T) => R) {
  return (value: T, ctx: z.RefinementCtx): R => {
    try { return normalize(value); }
    catch (error) {
      ctx.addIssue({ code: "custom", message: error instanceof Error ? error.message : "입력값을 확인해 주세요." });
      return z.NEVER;
    }
  };
}

const flexibleCount = z.union([z.number(), z.string()]).nullish().transform(checked(normalizeCount));

export const itemSchema = z.object({
  organization: organizationSchema,
  manager_main: nullableText,
  manager_sub: nullableText,
  management_no: z.string("관리번호는 필수입니다.").trim().min(1, "관리번호는 필수입니다."),
  item_type: textOrEmpty,
  acquired_date: nullableText.transform(checked(normalizeAcquiredDate)),
  item_name: textOrEmpty,
  model_name: nullableText,
  purchase_price: z.union([z.number(), z.string()]).nullish().transform(normalizePurchasePrice),
  useful_life_years: flexibleCount,
  storage_location: nullableText,
  accessories: nullableText,
  specification: nullableText,
  classification_no: nullableText,
  identification_no: nullableText,
  photo_url: nullableText.transform(checked(normalizePhotoInput)),
  unit: nullableText,
  quantity: flexibleCount,
  item_status: nullableText,
});
