import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { isAdmin } from "@/lib/auth";
import { listItems } from "@/lib/db";
import { organizationSchema } from "@/lib/validation";

export async function GET(request: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  const org = organizationSchema.parse(request.nextUrl.searchParams.get("org")?.toUpperCase());
  const q = request.nextUrl.searchParams.get("q") || "";
  const type = request.nextUrl.searchParams.get("type") || "";
  const items = await listItems(org, q, type);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(org);
  sheet.columns = [
    ["관리책임자(정)", "manager_main", 18], ["관리책임자(부)", "manager_sub", 18], ["관리번호", "management_no", 20],
    ["물품유형", "item_type", 16], ["취득일자", "acquired_date", 14], ["품명", "item_name", 28], ["구매단가", "purchase_price", 16],
    ["내용년수", "useful_life_years", 12], ["보관장소", "storage_location", 24], ["기타구성품", "accessories", 28], ["규격", "specification", 28],
    ["물품분류번호", "classification_no", 18], ["물품식별번호", "identification_no", 18], ["물품사진 URL", "photo_url", 45]
  ].map(([header,key,width]) => ({ header, key, width: Number(width) }));

  items.forEach((item) => sheet.addRow(item));
  const color = org === "CBGC" ? "00A8A8" : "EA5B96";
  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${color}` } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: "A1", to: "N1" };
  sheet.getColumn("purchase_price").numFmt = "#,##0";
  const buffer = await workbook.xlsx.writeBuffer();
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return new NextResponse(Buffer.from(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${org}_물품대장_${date}.xlsx`)}`,
    },
  });
}
