import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { createItem, listItems } from "@/lib/db";
import { itemSchema, organizationSchema } from "@/lib/validation";

function dbError(error: unknown) {
  const msg = error instanceof Error ? error.message : "데이터베이스 오류";
  if (msg.includes("inventory_items_organization_management_no_key") || msg.includes("duplicate key")) {
    return NextResponse.json({ error: "해당 물품대장에 동일한 관리번호가 존재합니다." }, { status: 409 });
  }
  console.error(error);
  return NextResponse.json({ error: "데이터 처리 중 오류가 발생했습니다." }, { status: 500 });
}

export async function GET(request: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  try {
    const org = organizationSchema.parse(request.nextUrl.searchParams.get("org")?.toUpperCase());
    const q = request.nextUrl.searchParams.get("q") || "";
    const type = request.nextUrl.searchParams.get("type") || "";
    return NextResponse.json({ items: await listItems(org, q, type) });
  } catch (error) { return dbError(error); }
}

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  try {
    const data = itemSchema.parse(await request.json());
    const item = await createItem({ ...data } as never);
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) { return dbError(error); }
}
