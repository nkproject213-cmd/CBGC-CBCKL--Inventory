import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { mediaUrl, putImage } from "@/lib/storage";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024;

function safeExt(file: File) {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

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
      return NextResponse.json({ error: "JPG, PNG, WEBP 파일만 업로드할 수 있습니다." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "파일 크기는 5MB 이하만 가능합니다." }, { status: 400 });
    }

    const key = `inventory/${crypto.randomUUID()}.${safeExt(file)}`;
    await putImage(key, file);

    return NextResponse.json({ url: mediaUrl(key) });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "사진 업로드에 실패했습니다." }, { status: 500 });
  }
}
