import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { isAdmin } from "@/lib/auth";
import { deleteItem, getItem, updateItem } from "@/lib/db";
import { itemSchema } from "@/lib/validation";

function errorResponse(error: unknown) {
  const msg = error instanceof Error ? error.message : "";
  if (msg.includes("duplicate key")) {
    return NextResponse.json(
      { error: "해당 물품대장에 동일한 관리번호가 존재합니다." },
      { status: 409 }
    );
  }
  console.error(error);
  return NextResponse.json(
    { error: "데이터 처리 중 오류가 발생했습니다." },
    { status: 500 }
  );
}

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const { id } = await params;
  const item = await getItem(id);

  if (!item) {
    return NextResponse.json(
      { error: "물품을 찾을 수 없습니다." },
      { status: 404 }
    );
  }

  return NextResponse.json({ item });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    const { id } = await params;
    const before = await getItem(id);

    if (!before) {
      return NextResponse.json(
        { error: "물품을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const data = itemSchema.parse(await request.json());
    const item = await updateItem(id, { ...data } as never);

    if (
      before.photo_url &&
      before.photo_url !== item?.photo_url &&
      before.photo_url.includes("blob.vercel-storage.com")
    ) {
      del(before.photo_url).catch(console.error);
    }

    return NextResponse.json({ item });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    const { id } = await params;
    const deleted = await deleteItem(id);

    if (!deleted) {
      return NextResponse.json(
        { error: "물품을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    if (deleted.photo_url?.includes("blob.vercel-storage.com")) {
      del(deleted.photo_url).catch(console.error);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
