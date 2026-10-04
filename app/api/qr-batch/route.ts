import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import JSZip from "jszip";
import { isAdmin } from "@/lib/auth";
import { listItems } from "@/lib/db";
import { organizationSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function safeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

export async function GET(request: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    const org = organizationSchema.parse(
      request.nextUrl.searchParams.get("org")?.toUpperCase()
    );
    const mode = request.nextUrl.searchParams.get("mode") || "zip";
    const items = await listItems(org);

    items.sort((a, b) =>
      a.management_no.localeCompare(b.management_no, "ko", {
        numeric: true,
        sensitivity: "base",
      })
    );

    if (mode === "zip") {
      const zip = new JSZip();
      const folder = zip.folder(`${org}_QR`);
      const origin = request.nextUrl.origin;

      await Promise.all(
        items.map(async (item, index) => {
          const target = `${origin}/item/${item.public_id}`;
          const png = await QRCode.toBuffer(target, {
            type: "png",
            width: 900,
            margin: 2,
            errorCorrectionLevel: "H",
          });
          const order = String(index + 1).padStart(4, "0");
          folder?.file(
            `${order}_${safeFileName(item.management_no)}_QR.png`,
            png
          );
        })
      );

      const buffer = await zip.generateAsync({
        type: "uint8array",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
      });

      return new NextResponse(buffer, {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${org}_QR_ALL.zip"`,
          "Cache-Control": "no-store",
        },
      });
    }

    if (mode === "labels") {
      const pages = chunks(items, 40);
      const origin = request.nextUrl.origin;
      const pageHtml =
        pages.length === 0
          ? '<div class="empty">등록된 물품이 없습니다.</div>'
          : pages
              .map(
                (page, pageIndex) => `
          <section class="sheet">
            ${page
              .map(
                (item, itemIndex) => `
              <div class="label">
                <img class="qr" src="${origin}/api/qr/${item.public_id}" alt="QR">
                <div class="label-info">
                  <div class="org">${org}</div>
                  <div class="no">${escapeHtml(item.management_no)}</div>
                  <div class="seq">${pageIndex * 40 + itemIndex + 1}</div>
                </div>
              </div>`
              )
              .join("")}
          </section>`
              )
              .join("");

      const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <title>${org} QR 40칸 라벨</title>
  <style>
    *{box-sizing:border-box}
    @page{size:A4 portrait;margin:14mm 11mm}
    html,body{margin:0;padding:0}
    body{font-family:Arial,"Noto Sans KR","Apple SD Gothic Neo",sans-serif;color:#111}
    .controls{position:sticky;top:0;z-index:10;display:flex;align-items:center;gap:10px;padding:12px 16px;background:#fff;border-bottom:1px solid #ddd}
    .controls button{border:0;border-radius:8px;background:#111;color:#fff;padding:9px 14px;font-weight:700;cursor:pointer}
    .controls span{font-size:12px;color:#555}
    .sheet{width:188mm;height:269mm;display:grid;grid-template-columns:repeat(4,47mm);grid-template-rows:repeat(10,26.9mm);break-after:page;page-break-after:always}
    .sheet:last-of-type{break-after:auto;page-break-after:auto}
    .label{width:47mm;height:26.9mm;overflow:hidden;display:grid;grid-template-columns:22mm 1fr;align-items:center;padding:1.6mm}
    .qr{display:block;width:20mm;height:20mm;object-fit:contain}
    .label-info{min-width:0;padding-left:1mm}
    .org{font-size:6.5pt;font-weight:700;color:#666;margin-bottom:1.2mm}
    .no{font-size:8pt;font-weight:800;line-height:1.18;overflow-wrap:anywhere;word-break:break-all}
    .seq{font-size:5.5pt;color:#aaa;margin-top:1.2mm}
    .empty{padding:40px;text-align:center}
    @media screen{
      body{background:#eef1f4}
      .sheet{margin:18px auto;background:#fff;box-shadow:0 4px 22px rgba(0,0,0,.12)}
    }
    @media print{
      .controls{display:none}
      body{background:#fff}
      .sheet{margin:0;box-shadow:none}
    }
  </style>
</head>
<body>
  <div class="controls">
    <button onclick="window.print()">인쇄 / PDF 저장</button>
    <span>A4 40칸(4×10), 47×26.9mm · 인쇄 배율 100% 권장 · 총 ${items.length}개</span>
  </div>
  ${pageHtml}
  <script>
    window.addEventListener("load", () => {
      const images = Array.from(document.images);
      Promise.all(images.map(img => img.complete ? Promise.resolve() : new Promise(resolve => {
        img.onload = resolve; img.onerror = resolve;
      }))).then(() => setTimeout(() => window.print(), 150));
    });
  <\/script>
</body>
</html>`;

      return new NextResponse(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }

    return NextResponse.json({ error: "지원하지 않는 다운로드 방식입니다." }, { status: 400 });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "QR 일괄 파일 생성 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
