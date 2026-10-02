import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { getPublicItem } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const item = await getPublicItem(publicId);
  if (!item) return NextResponse.json({ error: "물품을 찾을 수 없습니다." }, { status: 404 });
  const target = `${request.nextUrl.origin}/item/${item.public_id}`;
  const png = await QRCode.toBuffer(target, { type: "png", width: 700, margin: 2, errorCorrectionLevel: "H" });
  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `inline; filename="${item.organization}-${item.management_no}-qr.png"`,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
