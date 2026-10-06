import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { getLabelSettings, saveLabelSettings } from "@/lib/db";
import { organizationSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    const org = organizationSchema.parse(
      request.nextUrl.searchParams.get("org")?.toUpperCase()
    );
    const settings = await getLabelSettings(org);
    return NextResponse.json({ settings });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "라벨 설정을 불러오지 못했습니다." },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const org = organizationSchema.parse(String(body.organization || "").toUpperCase());
    const imageUrl =
      typeof body.label_image_url === "string" && body.label_image_url.trim()
        ? body.label_image_url.trim()
        : null;
    const scale = Math.min(100, Math.max(20, Number(body.label_image_scale) || 80));

    const settings = await saveLabelSettings(org, imageUrl, scale);
    return NextResponse.json({ settings });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "라벨 설정을 저장하지 못했습니다." },
      { status: 500 }
    );
  }
}
