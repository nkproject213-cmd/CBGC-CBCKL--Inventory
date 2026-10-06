import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { deleteItemsForOrg } from "@/lib/db";
import { organizationSchema } from "@/lib/validation";

export async function DELETE(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const org = organizationSchema.parse(String(body.organization || "").toUpperCase());
    const expected = `${org} 전체삭제`;

    if (body.confirmation !== expected) {
      return NextResponse.json(
        { error: `확인 문구가 올바르지 않습니다. '${expected}'를 입력해 주세요.` },
        { status: 400 }
      );
    }

    const deleted = await deleteItemsForOrg(org);
    return NextResponse.json({ deleted });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "전체삭제 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
