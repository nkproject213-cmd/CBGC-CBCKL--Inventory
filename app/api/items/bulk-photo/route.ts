import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { isAdmin } from "@/lib/auth";
import { updatePhotoForItems } from "@/lib/db";
import { isSharedPhotoUrl, MAX_BULK_PHOTO_ITEMS } from "@/lib/shared-photo";
import { organizationSchema } from "@/lib/validation";

const schema = z.object({
  organization: z.string().trim().toUpperCase().pipe(organizationSchema),
  ids: z.array(z.string().trim().uuid("물품 선택 정보가 올바르지 않습니다.").toLowerCase())
    .min(1, "사진을 적용할 물품을 선택해 주세요.")
    .transform(ids => [...new Set(ids)])
    .refine(ids => ids.length <= MAX_BULK_PHOTO_ITEMS, "한 번에 최대 2,000개까지 적용할 수 있습니다."),
  photo_url: z.string().trim().refine(isSharedPhotoUrl, "일괄 적용할 사진을 업로드해 주세요."),
});

export async function PATCH(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  let body: unknown;
  try { body = await request.json(); }
  catch {
    return NextResponse.json({ error: "요청 내용을 확인해 주세요." }, { status: 400 });
  }

  try {
    const { organization, ids, photo_url } = schema.parse(body);
    const result = await updatePhotoForItems(organization, ids, photo_url);
    if (!result) {
      return NextResponse.json(
        { error: "선택한 물품이 삭제되거나 다른 물품대장으로 이동했습니다. 목록을 새로고침하고 다시 선택해 주세요." },
        { status: 409 }
      );
    }
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues.map(issue => issue.message).join(", ") }, { status: 400 });
    }
    console.error("Bulk photo update failed", error);
    return NextResponse.json({ error: "사진 일괄 적용에 실패했습니다. 다시 시도해 주세요." }, { status: 500 });
  }
}
