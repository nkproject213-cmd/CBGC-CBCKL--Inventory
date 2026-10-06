import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { isAdmin } from "@/lib/auth";

export const runtime = "nodejs";

const HEADERS = [
  "관리책임자(정)", "관리책임자(부)", "관리번호", "물품유형", "취득일자", "품명",
  "구매단가", "내용년수", "보관장소", "기타구성품", "규격",
  "물품분류번호", "물품식별번호", "물품사진URL",
];

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("물품업로드");
  const guide = workbook.addWorksheet("작성안내");
  const example = workbook.addWorksheet("작성예시");

  sheet.addRow(HEADERS);
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF00A8A8" } };
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  const widths = [16,16,20,16,13,24,14,12,22,28,24,20,20,34];
  sheet.columns.forEach((column, index) => {
    column.width = widths[index];
  });

  guide.mergeCells("A1:B1");
  guide.getCell("A1").value = "CBGC·CBCKL 물품대장 엑셀 업로드 작성안내";
  guide.getCell("A1").font = { bold: true, color: { argb: "FFFFFFFF" }, size: 14 };
  guide.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
  guide.addRows([
    [],
    ["항목", "안내"],
    ["업로드 시트", "'물품업로드' 시트의 2행부터 데이터를 입력합니다."],
    ["필수 입력", "관리번호, 물품유형, 품명"],
    ["소속 물품대장", "업로드를 실행한 현재 CBGC 또는 CBCKL 물품대장으로 자동 등록됩니다."],
    ["취득일자", "YYYY-MM-DD 형식을 권장합니다. 예: 2026-10-06"],
    ["구매단가", "숫자만 입력합니다. 예: 1500000"],
    ["내용년수", "정수로 입력합니다. 예: 5"],
    ["물품사진URL", "선택사항입니다. 공개 이미지 URL이 있는 경우에만 입력합니다."],
  ]);
  guide.getColumn(1).width = 20;
  guide.getColumn(2).width = 70;

  example.addRow(HEADERS);
  example.addRow([
    "홍길동", "김영희", "CBGC-2026-001", "PC", "2026-10-06", "테스트 노트북",
    1500000, 5, "게임센터 2층", "충전기, 마우스", "15인치 / 16GB",
    "43211503", "1234567890", "",
  ]);
  example.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  example.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF6B7280" } };
  example.columns.forEach((column, index) => {
    column.width = widths[index];
  });

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer as never, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="inventory_import_template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
