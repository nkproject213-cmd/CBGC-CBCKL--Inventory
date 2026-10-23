import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import JSZip from "jszip";
import { isAdmin } from "@/lib/auth";
import { listItems } from "@/lib/db";
import { organizationSchema } from "@/lib/validation";
import { renderQrLabelDocument } from "@/lib/qr-print";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function safeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_");
}

// Streaming also supports complete 1,500-item label sheets over 4.5 MB.
function streamBytes(bytes: Uint8Array): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.byteLength) { controller.close(); return; }
      const end = Math.min(offset + 32 * 1024, bytes.byteLength);
      controller.enqueue(bytes.slice(offset, end));
      offset = end;
    },
  });
}

export async function GET(request: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }
  const parsedOrg = organizationSchema.safeParse(request.nextUrl.searchParams.get("org")?.toUpperCase());
  if (!parsedOrg.success) return NextResponse.json({ error: "물품대장을 확인해 주세요." }, { status: 400 });
  const org = parsedOrg.data;
  const mode = request.nextUrl.searchParams.get("mode") || "zip";
  if (mode !== "zip" && mode !== "labels") {
    return NextResponse.json({ error: "지원하지 않는 다운로드 방식입니다." }, { status: 400 });
  }
  try {
    const publicId = request.nextUrl.searchParams.get("publicId");
    let items = await listItems(org);
    if (publicId) {
      items = items.filter((item) => item.public_id === publicId);
      if (!items.length) return NextResponse.json({ error: "물품을 찾을 수 없습니다." }, { status: 404 });
    }
    items.sort((a, b) => a.management_no.localeCompare(b.management_no, "ko", { numeric: true, sensitivity: "base" }));
    const origin = request.nextUrl.origin;

    if (mode === "labels") {
      const qrSvgs = new Map<string, string>();
      // Embed generated QR vectors once; printing does not issue one DB request per label.
      for (let offset = 0; offset < items.length; offset += 24) {
        await Promise.all(items.slice(offset, offset + 24).map(async (item) => {
          const svg = await QRCode.toString(`${origin}/item/${item.public_id}`, {
            type: "svg", margin: 4, errorCorrectionLevel: "M",
          });
          qrSvgs.set(item.public_id, svg);
        }));
      }
      const html = renderQrLabelDocument(org, items, qrSvgs);
      return new NextResponse(streamBytes(new TextEncoder().encode(html)), {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
      });
    }

    const zip = new JSZip();
    const folder = zip.folder(`${org}_QR`);
    // Bound PNG generation concurrency to avoid spikes with large inventories.
    for (let offset = 0; offset < items.length; offset += 16) {
      await Promise.all(items.slice(offset, offset + 16).map(async (item, index) => {
        const png = await QRCode.toBuffer(`${origin}/item/${item.public_id}`, {
          type: "png", width: 900, margin: 2, errorCorrectionLevel: "H",
        });
        const order = String(offset + index + 1).padStart(4, "0");
        folder?.file(`${order}_${safeFileName(item.management_no)}_QR.png`, png);
      }));
    }
    const buffer = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
    return new NextResponse(streamBytes(buffer), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${org}_QR_ALL.zip"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "QR 일괄 파일 생성 중 오류가 발생했습니다." }, { status: 500 });
  }
}
