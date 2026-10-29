import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { neon } from "@neondatabase/serverless";
import { isAdmin } from "@/lib/auth";
import { listItems } from "@/lib/db";
import { organizationSchema } from "@/lib/validation";
import { executeImport, planImport } from "@/lib/excel-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  try {
    const form = await request.formData();
    const file = form.get("file");
    const parsedOrg = organizationSchema.safeParse(String(form.get("organization") || "").toUpperCase());
    if (!parsedOrg.success) return NextResponse.json({ error: "물품대장을 확인해 주세요." }, { status: 400 });
    const org = parsedOrg.data;
    if (!(file instanceof File)) return NextResponse.json({ error: "엑셀 파일을 선택해 주세요." }, { status: 400 });
    if (!file.name.toLowerCase().endsWith(".xlsx")) return NextResponse.json({ error: "XLSX 파일만 업로드할 수 있습니다." }, { status: 400 });
    if (file.size > 4 * 1024 * 1024) return NextResponse.json({ error: "엑셀 파일은 4MB 이하만 업로드할 수 있습니다." }, { status: 400 });
    const workbook = new ExcelJS.Workbook();
    try { await workbook.xlsx.load(Buffer.from(await file.arrayBuffer()) as never); }
    catch { return NextResponse.json({ error: "엑셀 파일을 읽을 수 없습니다. 암호가 없는 XLSX 파일을 사용해 주세요." }, { status: 400 }); }
    const sheet = workbook.getWorksheet("물품업로드") || workbook.worksheets[0];
    if (!sheet) return NextResponse.json({ error: "엑셀 시트를 찾을 수 없습니다." }, { status: 400 });
    // This read also initializes the existing schema. It never changes item values.
    const existing = new Set((await listItems(org)).map(item => item.management_no));
    let plan: ReturnType<typeof planImport>;
    try { plan = planImport(sheet, existing, workbook.properties.date1904 === true); }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "엑셀 내용을 확인해 주세요." }, { status: 400 }); }
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not configured");
    const sql = neon(url);
    const result = await executeImport(plan, org, (text, values) => sql.query(text, values));
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Excel import failed", error);
    return NextResponse.json({ error: "엑셀 처리에 실패했습니다. 일부 행이 반영됐을 수 있으니 목록을 확인해 주세요. 같은 파일을 다시 올려도 기존 물품을 중복 생성하지 않습니다." }, { status: 500 });
  }
}
