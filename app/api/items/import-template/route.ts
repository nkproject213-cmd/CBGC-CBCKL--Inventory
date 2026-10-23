import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { isAdmin } from "@/lib/auth";

export const runtime = "nodejs";
const HEADERS = [
  "관리책임자(정)", "관리책임자(부)", "관리번호", "물품유형", "취득일자", "품명",
  "구매단가", "내용년수", "보관장소", "기타구성품", "규격",
  "물품분류번호", "물품식별번호", "물품사진URL", "단위", "수량", "상태",
];
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("물품업로드");
  const guide = workbook.addWorksheet("작성안내");
  const example = workbook.addWorksheet("작성예시");
  sheet.addRow(HEADERS);
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF00A8A8" } };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  const widths = [16,16,20,16,13,24,14,12,22,28,24,20,20,34,12,12,18];
  sheet.columns.forEach((column, index) => { column.width = widths[index]; });
  [3,12,13].forEach(index => { sheet.getColumn(index).numFmt = "@"; });
  sheet.getColumn(16).numFmt = "0";
  guide.mergeCells("A1:B1");
  guide.getCell("A1").value = "CBGC·CBCKL 물품대장 엑셀 업로드 작성안내";
  guide.getCell("A1").font = { bold: true, color: { argb: "FFFFFFFF" }, size: 14 };
  guide.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
  guide.addRows([
    [], ["항목", "안내"],
    ["업로드 시트", "'물품업로드' 시트의 2행부터 데이터를 입력합니다. 작성예시 시트는 업로드되지 않습니다."],
    ["필수 입력", "관리번호, 물품유형, 품명"],
    ["소속 물품대장", "현재 선택한 CBGC 또는 CBCKL 물품대장으로 등록됩니다."],
    ["취득일자", "YYYY-MM-DD 형식. 예: 2026-10-06"],
    ["구매단가", "숫자로 입력합니다. 예: 1500000"],
    ["내용년수", "정수로 입력합니다. 예: 5"],
    ["보관장소 / 위치", "인쇄 라벨의 '위치'에 표시됩니다. '위치'라는 열 이름도 사용할 수 있습니다."],
    ["단위", "선택사항. 예: 대, 개, 세트. 미입력 시 라벨에 -로 표시됩니다."],
    ["수량", "선택사항. 0 이상의 정수. 빈 칸은 미입력 상태이며 자동으로 1이 되지 않습니다."],
    ["상태", "선택사항. 예: 사용 중, 보관, 수리 중. 실제 상태를 입력합니다."],
    ["물품사진URL", "선택사항. 공개 이미지 URL만 입력합니다. 라벨에는 사진이 출력되지 않습니다."],
    ["기존 양식", "단위·수량·상태 열이 없는 기존 양식도 사용할 수 있습니다."],
    ["중복 관리번호", "기존 물품을 덮어쓰지 않고 해당 행을 오류로 안내합니다."],
  ]);
  guide.getColumn(1).width = 22;
  guide.getColumn(2).width = 76;
  guide.getColumn(2).alignment = { wrapText: true, vertical: "middle" };
  example.addRow(HEADERS);
  example.addRow(["홍길동","김영희","CBGC-2026-001","PC","2026-10-06","테스트 노트북",1500000,5,"게임센터 2층","충전기, 마우스","15인치 / 16GB","43211503","1234567890","","대",1,"사용 중"]);
  example.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  example.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF6B7280" } };
  example.columns.forEach((column, index) => { column.width = widths[index]; });
  const buffer = await workbook.xlsx.writeBuffer();
  const bytes = new Uint8Array(buffer.byteLength);
  bytes.set(new Uint8Array(buffer));
  return new NextResponse(bytes.buffer, { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": 'attachment; filename="inventory_import_template.xlsx"',
    "Cache-Control": "private, no-store",
  } });
}
