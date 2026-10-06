import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { isAdmin } from "@/lib/auth";
import { createItem } from "@/lib/db";
import { itemSchema, organizationSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = [
  "관리책임자(정)", "관리책임자(부)", "관리번호", "물품유형", "취득일자", "품명",
  "구매단가", "내용년수", "보관장소", "기타구성품", "규격",
  "물품분류번호", "물품식별번호", "물품사진URL",
] as const;

function primitive(cell: ExcelJS.Cell): string | number | Date | null {
  const value = cell.value;
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number" || value instanceof Date) {
    return value;
  }
  if (typeof value === "object" && "result" in value) {
    const result = value.result;
    if (
      result == null ||
      typeof result === "string" ||
      typeof result === "number" ||
      result instanceof Date
    ) {
      return result;
    }
  }
  return cell.text || null;
}

function textValue(value: string | number | Date | null) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function numberValue(value: string | number | Date | null) {
  if (value == null || value instanceof Date) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const cleaned = value.replaceAll(",", "").trim();
  if (!cleaned) return null;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

function dateValue(value: string | number | Date | null) {
  if (value == null || value === "") return null;

  let date: Date | null = null;
  if (value instanceof Date) {
    date = value;
  } else if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) date = parsed;
  }

  if (!date) return String(value).trim() || null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dbMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "등록 실패";
  if (message.includes("duplicate key") || message.includes("inventory_items_organization_management_no_key")) {
    return "동일한 관리번호가 이미 존재합니다.";
  }
  return "데이터 등록 중 오류가 발생했습니다.";
}

export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    const form = await request.formData();
    const file = form.get("file");
    const org = organizationSchema.parse(String(form.get("organization") || "").toUpperCase());

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "엑셀 파일을 선택해 주세요." }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      return NextResponse.json({ error: "XLSX 파일만 업로드할 수 있습니다." }, { status: 400 });
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "엑셀 파일은 10MB 이하만 업로드할 수 있습니다." }, { status: 400 });
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(await file.arrayBuffer()));
    const sheet = workbook.getWorksheet("물품업로드") || workbook.worksheets[0];

    if (!sheet) {
      return NextResponse.json({ error: "엑셀 시트를 찾을 수 없습니다." }, { status: 400 });
    }

    const headerMap = new Map<string, number>();
    sheet.getRow(1).eachCell((cell, colNumber) => {
      const key = cell.text.trim();
      if (key) headerMap.set(key, colNumber);
    });

    const missing = ["관리번호", "물품유형", "품명"].filter((header) => !headerMap.has(header));
    if (missing.length) {
      return NextResponse.json(
        { error: `필수 열이 없습니다: ${missing.join(", ")}` },
        { status: 400 }
      );
    }

    const read = (row: ExcelJS.Row, header: string) => {
      const col = headerMap.get(header);
      return col ? primitive(row.getCell(col)) : null;
    };

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      const hasContent = HEADERS.some((header) => {
        const value = read(row, header);
        return value != null && String(value).trim() !== "";
      });

      if (!hasContent) {
        skipped += 1;
        continue;
      }

      const candidate = {
        organization: org,
        manager_main: textValue(read(row, "관리책임자(정)")),
        manager_sub: textValue(read(row, "관리책임자(부)")),
        management_no: textValue(read(row, "관리번호")) || "",
        item_type: textValue(read(row, "물품유형")) || "",
        acquired_date: dateValue(read(row, "취득일자")),
        item_name: textValue(read(row, "품명")) || "",
        purchase_price: numberValue(read(row, "구매단가")),
        useful_life_years: numberValue(read(row, "내용년수")),
        storage_location: textValue(read(row, "보관장소")),
        accessories: textValue(read(row, "기타구성품")),
        specification: textValue(read(row, "규격")),
        classification_no: textValue(read(row, "물품분류번호")),
        identification_no: textValue(read(row, "물품식별번호")),
        photo_url: textValue(read(row, "물품사진URL")),
      };

      const parsed = itemSchema.safeParse(candidate);
      if (!parsed.success) {
        errors.push(
          `${rowNumber}행: ${parsed.error.issues.map((issue) => issue.message).join(", ")}`
        );
        continue;
      }

      try {
        await createItem(parsed.data as never);
        created += 1;
      } catch (error) {
        errors.push(`${rowNumber}행: ${dbMessage(error)}`);
      }
    }

    return NextResponse.json({
      created,
      skipped,
      failed: errors.length,
      errors: errors.slice(0, 30),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "엑셀 업로드 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
