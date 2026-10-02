import { NextResponse } from "next/server";
import { getImage } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ key: string[] }> }
) {
  try {
    const { key } = await params;
    const objectKey = key.map(decodeURIComponent).join("/");
    const object = await getImage(objectKey);

    if (!object.Body) {
      return NextResponse.json(
        { error: "이미지를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const bytes = await object.Body.transformToByteArray();
    const body = Buffer.from(bytes);

    return new NextResponse(body, {
      headers: {
        "Content-Type": object.ContentType || "application/octet-stream",
        "Cache-Control": object.CacheControl || "public, max-age=86400",
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "이미지를 찾을 수 없습니다." },
      { status: 404 }
    );
  }
}
