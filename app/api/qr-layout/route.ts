import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { organizationSchema } from "@/lib/validation";
import { parseLayout } from "@/lib/qr-layout";
import { getQrLayout, saveQrLayout, LayoutConflict } from "@/lib/qr-layout-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401, headers });
  const org = organizationSchema.safeParse(request.nextUrl.searchParams.get("org")?.toUpperCase());
  if (!org.success) return NextResponse.json({ error: "물품대장을 확인해 주세요." }, { status: 400, headers });
  try { return NextResponse.json(await getQrLayout(org.data), { headers }); }
  catch (error) { console.error("QR layout read failed", error); return NextResponse.json({ error: "레이아웃을 불러오지 못했습니다. 다시 시도해 주세요." }, { status: 500, headers }); }
}
export async function PUT(request: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401, headers });
  // Same-origin JSON only; do not accept cross-site form submissions.
  if (!request.headers.get("content-type")?.includes("application/json")) return NextResponse.json({ error: "JSON 형식이 필요합니다." }, { status: 415, headers });
  if (request.headers.get("sec-fetch-site") === "cross-site") return NextResponse.json({ error: "허용되지 않은 요청입니다." }, { status: 403, headers });
  let body;
  try {
    const raw = await request.text();
    if (raw.length > 12000) throw new Error("레이아웃 데이터가 너무 큽니다.");
    body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("잘못된 요청입니다.");
    body.organization = organizationSchema.parse(body.organization);
    if (!Number.isSafeInteger(body.revision) || body.revision < 0) throw new Error("레이아웃 버전을 확인해 주세요.");
    body.layout = parseLayout(body.layout);
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "설정값을 확인해 주세요." }, { status: 400, headers }); }
  try { return NextResponse.json(await saveQrLayout(body.organization, body.layout, body.revision), { headers }); }
  catch (error) {
    if (error instanceof LayoutConflict) return NextResponse.json({ error: error.message }, { status: 409, headers });
    console.error("QR layout save failed", error);
    return NextResponse.json({ error: "레이아웃 저장에 실패했습니다. 변경 내용은 화면에 유지됩니다." }, { status: 500, headers });
  }
}
