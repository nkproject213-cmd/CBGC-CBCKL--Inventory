import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicItem } from "@/lib/db";
import { isAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function PublicItemPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const item = await getPublicItem(publicId);
  if (!item) notFound();
  const admin = await isAdmin();
  const color = item.organization === "CBGC" ? "#00a8a8" : "#ea5b96";
  const dark = item.organization === "CBGC" ? "#008c8c" : "#cf3d7d";
  const rows = [
    ["품명", item.item_name], ["관리번호", item.management_no], ["규격", item.specification],
    ["취득일자", item.acquired_date], ["보관장소", item.storage_location],
    ["관리책임자(정)", item.manager_main], ["관리책임자(부)", item.manager_sub],
  ];
  return (
    <main className="public-page" style={{ "--primary": color, "--primary-dark": dark } as React.CSSProperties}>
      <div className="public-shell">
        <header className="public-head"><h1>{item.organization} 물품정보</h1><p>QR코드를 통해 확인하는 공개 물품정보입니다.</p></header>
        <section className="public-card">
          <div className="public-photo">
            {item.photo_url ? <Image src={item.photo_url} alt={`${item.item_name} 사진`} fill sizes="(max-width: 760px) 100vw, 760px" priority /> : <div className="no-photo">NO IMAGE</div>}
          </div>
          <div className="info-list">
            {rows.map(([label, value]) => <div className="info-row" key={label}><b>{label}</b><span>{value || "-"}</span></div>)}
          </div>
        </section>
        <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 16 }}>
          {admin ? (
            <Link className="btn primary" href={`/admin/${item.organization.toLowerCase()}/items?edit=${item.public_id}`}>이 물품 수정</Link>
          ) : (
            <Link className="btn" href={`/admin/login?next=${encodeURIComponent(`/item/${publicId}`)}`}>관리자 로그인</Link>
          )}
        </div>
        <footer className="public-foot">{item.organization} 물품관리 시스템</footer>
      </div>
    </main>
  );
}
