import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { updateManagersForOrg } from "@/lib/db";
import { organizationSchema } from "@/lib/validation";

export async function PATCH(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const org = organizationSchema.parse(String(body.organization || "").toUpperCase());
    const managerMain =
      typeof body.manager_main === "string" && body.manager_main.trim()
        ? body.manager_main.trim()
        : null;
    const managerSub =
      typeof body.manager_sub === "string" && body.manager_sub.trim()
        ? body.manager_sub.trim()
        : null;

    if (!managerMain && !managerSub) {
      return NextResponse.json(
        { error: "관리책임자(정) 또는 관리책임자(부) 중 하나 이상 입력해 주세요." },
        { status: 400 }
      );
    }

    const updated = await updateManagersForOrg(org, managerMain, managerSub);
    return NextResponse.json({ updated });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "관리책임자 일괄 적용 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
