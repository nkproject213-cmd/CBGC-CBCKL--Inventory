import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { isAdmin } from "@/lib/auth";
import { listItems } from "@/lib/db";
import { organizationSchema } from "@/lib/validation";

export async function GET(request: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const org = organizationSchema.parse(
    request.nextUrl.searchParams.get("org")?.toUpperCase()
  );
  const q = request.nextUrl.searchParams.get("q") || "";
  const type = request.nextUrl.searchParams.get("type") || "";
  const items = await listItems(org, q, type);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(org);

  sheet.columns = [
    { header: "관리책임자(정)", key: "manager_main", width: 18 },
    { header: "관리책임자(부)", key: "manager_sub", width: 18 },
    { header: "관리번호", key: "management_no", width: 20 },
    { header: "물품유형", key: "item_type", width: 16 },
    { header: "취득일자", key: "acquired_date", width: 14 },
    { header: "품명", key: "item_name", width: 28 },
    { header: "구매단가", key: "purchase_price", width: 16 },
    { header: "내용년수", key: "useful_life_years", width: 12 },
    { header: "보관장소", key: "storage_location", width: 24 },
    { header: "기타구성품", key: "accessories", width: 28 },
    { header: "규격", key: "specification", width: 28 },
    { header: "물품분류번호", key: "classification_no", width: 18 },
    { header: "물품식별번호", key: "identification_no", width: 18 },
    { header: "물품사진 URL", key: "photo_url", width: 45 },
  ];

  items.forEach((item) => sheet.addRow(item));

  const color = org === "CBGC" ? "00A8A8" : "EA5B96";

  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: `FF${color}` },
    };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });

  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: "A1", to: "N1" };
  sheet.getColumn("purchase_price").numFmt = "#,##0";

  const buffer = await workbook.xlsx.writeBuffer();
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");

  return new NextResponse(Buffer.from(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(
        `${org}_물품대장_${date}.xlsx`
      )}`,
    },
  });
}
