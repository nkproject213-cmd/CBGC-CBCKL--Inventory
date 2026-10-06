import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { deleteItemsByIdsForOrg } from "@/lib/db";
import { organizationSchema } from "@/lib/validation";

export async function DELETE(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const org = organizationSchema.parse(String(body.organization || "").toUpperCase());
    const rawIds: unknown[] = Array.isArray(body.ids) ? body.ids : [];
    const ids: string[] = [...new Set(
      rawIds.filter((id: unknown): id is string =>
        typeof id === "string" && id.trim().length > 0
      )
    )];

    if (!ids.length) {
      return NextResponse.json({ error: "삭제할 물품을 선택해 주세요." }, { status: 400 });
    }
    if (ids.length > 2000) {
      return NextResponse.json({ error: "한 번에 최대 2,000개까지 삭제할 수 있습니다." }, { status: 400 });
    }

    const deleted = await deleteItemsByIdsForOrg(org, ids);
    return NextResponse.json({ deleted });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "선택삭제 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
