import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { getPublicItem } from "@/lib/db";

export const dynamic = "force-dynamic";

function qrContentDisposition(organization: string, managementNo: string, publicId: string) {
  // HTTP headers must not contain raw Unicode. Keep an ASCII fallback and
  // send the readable filename with RFC 6266 / RFC 8187 UTF-8 encoding.
  const filename = `${organization}-${managementNo}-qr.png`
    .replace(/[\u0000-\u001f\u007f\\/:*?"<>|]/g, "_");
  const encodedFilename = encodeURIComponent(filename).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
  const fallback = `${organization}-${publicId}-qr.png`;
  return `inline; filename="${fallback}"; filename*=UTF-8''${encodedFilename}`;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const item = await getPublicItem(publicId);
  if (!item) return NextResponse.json({ error: "물품을 찾을 수 없습니다." }, { status: 404 });
  const target = `${request.nextUrl.origin}/item/${item.public_id}`;
  const png = await QRCode.toBuffer(target, { type: "png", width: 700, margin: 2, errorCorrectionLevel: "H" });
  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": qrContentDisposition(item.organization, item.management_no, item.public_id),
      "Cache-Control": "public, max-age=3600",
    },
  });
}
