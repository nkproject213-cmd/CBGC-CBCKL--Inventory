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
    ["업로드 시트", "'물품업로드' 시트의 2행부터 입력합니다. 작성예시 시트는 업로드되지 않습니다. XLSX 4MB 이하, 최대 5,000행."],
    ["기존 물품 수정", "현재 대장의 관리번호가 같은 물품은 엑셀에 입력한 값만 수정합니다. 관리번호와 수정할 열만 있어도 됩니다."],
    ["기존 값 유지", "빈칸·공백·없는 열은 기존 값을 유지합니다. 엑셀에 없는 물품도 그대로 둡니다. 빈칸으로 기존 값을 삭제하지 않습니다."],
    ["신규 등록 필수", "현재 대장에 없는 관리번호는 새로 등록합니다. 신규 등록에만 관리번호·물품유형·품명이 모두 필요합니다."],
    ["소속 물품대장", "현재 선택한 CBGC 또는 CBCKL에만 반영됩니다. 다른 대장의 같은 관리번호는 변경하지 않습니다."],
    ["관리번호", "기존 관리번호와 정확히 일치하도록 입력합니다. 앞자리 0이 있는 번호는 텍스트 형식을 사용하세요. 관리번호 자체의 변경은 수정 및 상세에서 합니다."],
    ["취득일자", "YYYY-MM-DD 형식. 예: 2026-10-06. 빈칸은 기존 날짜 유지."],
    ["구매단가 / 내용년수", "0 이상의 정수로 입력합니다. 예: 1500000 / 5. 0은 빈칸이 아니라 실제 수정값입니다."],
    ["보관장소 / 위치", "'위치'라는 열 이름도 사용할 수 있습니다. 두 열을 동시에 넣지는 마세요."],
    ["단위 / 상태", "수정할 값만 입력합니다. 예: 대 / 사용 중. 빈칸은 기존 값 유지."],
    ["수량", "0 이상의 정수. 수량 0을 입력하면 0으로 수정합니다. 빈칸은 기존 수량 유지."],
    ["물품사진URL", "주소를 입력한 경우만 사진 주소를 수정합니다. 빈칸 또는 열 생략 시 기존 사진을 유지합니다. 기존 물품의 QR 주소는 유지됩니다."],
    ["파일 내부 중복", "한 파일에 같은 관리번호가 여러 번 있으면 그 번호의 행은 모두 제외하고 오류 행을 알려줍니다."],
    ["오류 / 재업로드", "잘못된 행은 변경하지 않고 다른 정상 행만 반영합니다. 같은 파일을 다시 올려도 기존 물품이 중복 생성되지 않습니다."],
    ["값 삭제", "기존 값을 비우려면 사이트의 수정 및 상세를 사용하세요. 엑셀 빈칸은 삭제 지시가 아닙니다."],
  ]);
  guide.getColumn(1).width = 22;
  guide.getColumn(2).width = 76;
  guide.getColumn(2).alignment = { wrapText: true, vertical: "middle" };
  guide.eachRow((row, index) => { if (index >= 4) row.height = 42; });
  example.addRow(HEADERS);
  example.addRow(["홍길동","김영희","CBGC-2026-001","PC","2026-10-06","테스트 노트북",1500000,5,"게임센터 2층","충전기, 마우스","15인치 / 16GB","43211503","1234567890","","대",1,"사용 중"]);
  example.addRow(["","","기존-관리번호-입력","","","","","","새 보관장소","","","","","","",0,""]);
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
