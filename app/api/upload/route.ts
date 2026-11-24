import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { isAdmin } from "@/lib/auth";
import { compressStoredPhoto } from "@/lib/compress-stored-photo.mjs";
import limits from "@/lib/photo-limits.json";
import { SHARED_PHOTO_PREFIX } from "@/lib/shared-photo";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_INPUT_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "파일이 없습니다." }, { status: 400 });
    }
    if (!ALLOWED.has(file.type)) {
      return NextResponse.json(
        { error: "JPG, PNG, WEBP 파일만 업로드할 수 있습니다." },
        { status: 400 }
      );
    }
    if (file.size > MAX_INPUT_BYTES) {
      return NextResponse.json(
        { error: "파일 크기는 5MB 이하만 가능합니다." },
        { status: 400 }
      );
    }

    let upload = file;
    if (file.size > limits.maxBytes) {
      try {
        const bytes = await compressStoredPhoto(Buffer.from(await file.arrayBuffer()));
        const name = file.name.replace(/\.[^.]+$/, "") || "image";
        upload = new File([new Uint8Array(bytes)], `${name}.webp`, { type: "image/webp" });
      } catch {
        return NextResponse.json({ error: "이미지를 250KB 이하로 압축할 수 없습니다." }, { status: 422 });
      }
    }

    const prefix = form.get("purpose") === "bulk-photo" ? SHARED_PHOTO_PREFIX : "inventory/";
    const filename = upload.name.replace(/[\\/\u0000-\u001f\u007f]/g, "_");
    const blob = await put(
      `${prefix}${crypto.randomUUID()}-${filename}`,
      upload,
      {
        access: "public",
        addRandomSuffix: true,
        contentType: upload.type,
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
