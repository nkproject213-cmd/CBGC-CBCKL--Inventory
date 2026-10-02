import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { isAdmin } from "@/lib/auth";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "파일이 없습니다." }, { status: 400 });
    }
    if (!ALLOWED.has(file.type)) {
      return NextResponse.json(
        { error: "JPG, PNG, WEBP 파일만 업로드할 수 있습니다." },
        { status: 400 }
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "파일 크기는 5MB 이하만 가능합니다." },
        { status: 400 }
      );
    }

    const blob = await put(
      `inventory/${crypto.randomUUID()}-${file.name}`,
      file,
      {
        access: "public",
        addRandomSuffix: true,
      }
    );

    return NextResponse.json({ url: blob.url });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "사진 업로드에 실패했습니다." },
      { status: 500 }
    );
  }
}
