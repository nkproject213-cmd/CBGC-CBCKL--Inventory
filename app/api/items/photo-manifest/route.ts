import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { isPhotoUrl } from "@/lib/flexible-fields";
import { listItems } from "@/lib/db";
import type { Organization } from "@/lib/types";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const scope = request.nextUrl.searchParams.get("org");
  if (scope !== "CBGC" && scope !== "CBCKL" && scope !== "ALL") return NextResponse.json({ error: "물품대장을 확인해 주세요." }, { status: 400 });
  try {
    const orgs: Organization[] = scope === "ALL" ? ["CBGC", "CBCKL"] : [scope];
    const all = (await Promise.all(orgs.map(org => listItems(org)))).flat();
    const photos = all.filter(item => isPhotoUrl(item.photo_url)).sort((a, b) => a.organization.localeCompare(b.organization) || a.management_no.localeCompare(b.management_no, "ko", { numeric: true }));
    return NextResponse.json({
      total: all.length, withoutPhoto: all.length - photos.length,
      items: photos.map(({ id, organization, management_no, item_name, photo_url }) => ({ id, organization, management_no, item_name, photo_url })),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Photo manifest failed", error);
    return NextResponse.json({ error: "물품사진 목록을 불러오지 못했습니다." }, { status: 500 });
  }
}
