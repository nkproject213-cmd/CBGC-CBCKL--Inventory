"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Menu, Plus, Download, LogOut, Pencil, QrCode, ExternalLink, Trash2, X, Printer, Copy } from "lucide-react";
import type { InventoryItem, Organization } from "@/lib/types";

type Section = "dashboard" | "items" | "qr";
type Form = {
  organization: Organization; manager_main: string; manager_sub: string; management_no: string; item_type: string;
  acquired_date: string; item_name: string; purchase_price: string; useful_life_years: string; storage_location: string;
  accessories: string; specification: string; classification_no: string; identification_no: string; photo_url: string;
};
const emptyForm = (org: Organization): Form => ({ organization: org, manager_main:"",manager_sub:"",management_no:"",item_type:"",acquired_date:"",item_name:"",purchase_price:"",useful_life_years:"",storage_location:"",accessories:"",specification:"",classification_no:"",identification_no:"",photo_url:"" });

export default function AdminConsole({ org, section }: { org: Organization; section: Section }) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null | undefined>(undefined);
  const [form, setForm] = useState<Form>(emptyForm(org));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [labelImageUrl, setLabelImageUrl] = useState("");
  const [labelImageScale, setLabelImageScale] = useState(80);
  const [labelSettingsLoading, setLabelSettingsLoading] = useState(false);
  const [labelUploading, setLabelUploading] = useState(false);
  const [labelSaving, setLabelSaving] = useState(false);
  const autoEditDone = useRef(false);

  const colors = org === "CBGC" ? { primary: "#00a8a8", dark: "#008c8c" } : { primary: "#ea5b96", dark: "#cf3d7d" };
  const base = `/admin/${org.toLowerCase()}`;

  async function load() {
    setLoading(true);
    const params = new URLSearchParams({ org });
    if (search) params.set("q", search);
    if (type) params.set("type", type);
    const res = await fetch(`/api/items?${params}`, { cache: "no-store" });
    if (res.status === 401) { location.href = "/admin/login"; return; }
    const body = await res.json();
    setItems(body.items || []);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [org, search, type]);
  useEffect(() => { setForm(emptyForm(org)); }, [org]);
  useEffect(() => {
    if (section !== "qr") return;
    let active = true;
    setLabelSettingsLoading(true);
    fetch(`/api/label-settings?org=${org}`, { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "라벨 설정을 불러오지 못했습니다.");
        if (!active) return;
        setLabelImageUrl(body.settings?.label_image_url || "");
        setLabelImageScale(body.settings?.label_image_scale || 80);
      })
      .catch((e) => {
        if (active) console.error(e);
      })
      .finally(() => {
        if (active) setLabelSettingsLoading(false);
      });
    return () => { active = false; };
  }, [org, section]);
  useEffect(() => {
    if (autoEditDone.current || loading) return;
    const publicId = new URLSearchParams(window.location.search).get("edit");
    if (!publicId) { autoEditDone.current = true; return; }
    const target = items.find((item) => item.public_id === publicId);
    if (target) {
      autoEditDone.current = true;
      openEdit(target);
    }
  }, [items, loading]);

  const allTypes = useMemo(() => [...new Set(items.map((i) => i.item_type))].sort(), [items]);
  const locations = useMemo(() => new Set(items.map((i) => i.storage_location).filter(Boolean)).size, [items]);
  const recent = useMemo(() => { const d = Date.now() - 30*86400000; return items.filter(i => new Date(i.created_at).getTime() >= d).length; }, [items]);

  function openNew() { setEditing(null); setForm(emptyForm(org)); }
  function openEdit(i: InventoryItem) {
    setEditing(i); setForm({ organization:i.organization, manager_main:i.manager_main||"", manager_sub:i.manager_sub||"", management_no:i.management_no, item_type:i.item_type, acquired_date:i.acquired_date?.slice(0,10)||"", item_name:i.item_name, purchase_price:i.purchase_price == null ? "" : String(i.purchase_price), useful_life_years:i.useful_life_years == null ? "" : String(i.useful_life_years), storage_location:i.storage_location||"", accessories:i.accessories||"", specification:i.specification||"", classification_no:i.classification_no||"", identification_no:i.identification_no||"", photo_url:i.photo_url||"" });
  }
  function field<K extends keyof Form>(key: K, value: Form[K]) { setForm((p) => ({ ...p, [key]: value })); }

  async function uploadPhoto(file?: File) {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "업로드 실패");
      field("photo_url", body.url);
    } catch (e) { alert(e instanceof Error ? e.message : "사진 업로드에 실패했습니다."); }
    finally { setUploading(false); }
  }

  async function persistLabelSettings(imageUrl = labelImageUrl, scale = labelImageScale) {
    setLabelSaving(true);
    try {
      const res = await fetch("/api/label-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organization: org,
          label_image_url: imageUrl || null,
          label_image_scale: scale,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "라벨 설정 저장 실패");
      setLabelImageUrl(body.settings?.label_image_url || "");
      setLabelImageScale(body.settings?.label_image_scale || 80);
    } catch (e) {
      alert(e instanceof Error ? e.message : "라벨 설정 저장에 실패했습니다.");
    } finally {
      setLabelSaving(false);
    }
  }

  async function uploadLabelImage(file?: File) {
    if (!file) return;
    setLabelUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "이미지 업로드 실패");
      setLabelImageUrl(body.url);
      await persistLabelSettings(body.url, labelImageScale);
    } catch (e) {
      alert(e instanceof Error ? e.message : "라벨 이미지 업로드에 실패했습니다.");
    } finally {
      setLabelUploading(false);
    }
  }

  async function removeLabelImage() {
    setLabelImageUrl("");
    await persistLabelSettings("", labelImageScale);
  }

  async function save() {
    if (!form.management_no.trim() || !form.item_type.trim() || !form.item_name.trim()) { alert("관리번호, 물품유형, 품명은 필수입니다."); return; }
    setSaving(true);
    try {
      const payload = { ...form, purchase_price: form.purchase_price === "" ? null : Number(form.purchase_price), useful_life_years: form.useful_life_years === "" ? null : Number(form.useful_life_years), acquired_date: form.acquired_date || null, manager_main:form.manager_main||null,manager_sub:form.manager_sub||null,storage_location:form.storage_location||null,accessories:form.accessories||null,specification:form.specification||null,classification_no:form.classification_no||null,identification_no:form.identification_no||null,photo_url:form.photo_url||null };
      const res = await fetch(editing ? `/api/items/${editing.id}` : "/api/items", { method: editing ? "PATCH" : "POST", headers: { "Content-Type":"application/json" }, body: JSON.stringify(payload) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "저장에 실패했습니다.");
      setEditing(undefined);
      if (payload.organization !== org) { location.href = `/admin/${payload.organization.toLowerCase()}/items`; return; }
      await load();
    } catch (e) { alert(e instanceof Error ? e.message : "저장에 실패했습니다."); }
    finally { setSaving(false); }
  }

  async function remove() {
    if (!editing || !confirm("정말 이 물품을 삭제하시겠습니까?")) return;
    const res = await fetch(`/api/items/${editing.id}`, { method:"DELETE" });
    if (!res.ok) { const b=await res.json(); alert(b.error || "삭제 실패"); return; }
    setEditing(undefined); await load();
  }

  async function logout() { await fetch("/api/auth/logout", { method:"POST" }); location.href="/admin/login"; }
  function excel() { const p = new URLSearchParams({ org }); if(search)p.set("q",search); if(type)p.set("type",type); location.href=`/api/export?${p}`; }
  async function copyPublicUrl(i: InventoryItem) {
    await navigator.clipboard.writeText(`${window.location.origin}/item/${i.public_id}`);
    alert("공개 URL이 복사되었습니다.");
  }
  function printQr(i: InventoryItem) {
    const w = window.open("", "_blank", "width=520,height=700");
    if (!w) return;
    const qr = `${window.location.origin}/api/qr/${i.public_id}`;
    const color = i.organization === "CBGC" ? "#00a8a8" : "#ea5b96";
    w.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${i.management_no} QR</title><style>body{font-family:Arial,sans-serif;display:grid;place-items:center;padding:30px}.label{width:320px;text-align:center;border:2px solid ${color};border-radius:16px;padding:20px}.org{font-size:24px;font-weight:900;color:${color}.no{font-size:16px;font-weight:800;margin-top:10px}.name{margin-top:6px}img{width:260px;height:260px}@media print{button{display:none}}</style></head><body><div class="label"><div class="org">${i.organization}</div><img src="${qr}" alt="QR"><div class="no">${i.management_no}</div><div class="name">${i.item_name}</div></div><script>window.onload=()=>window.print()<\/script></body></html>`);
    w.document.close();
  }
  const title = section === "dashboard" ? `${org} 물품관리 대시보드` : section === "items" ? `${org} 물품관리` : `${org} QR 관리`;

  return (
    <div className="admin" style={{ "--primary": colors.primary, "--primary-dark": colors.dark } as React.CSSProperties}>
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="logo">CBGC · CBCKL<small>통합 물품관리 시스템</small></div>
        <div className="side-label">물품대장 선택</div>
        <div className="org-switch">
          <Link className={org==="CBGC"?"active":""} href="/admin/cbgc/dashboard">CBGC</Link>
          <Link className={org==="CBCKL"?"active":""} href="/admin/cbckl/dashboard">CBCKL</Link>
        </div>
        <div className="side-label">관리 메뉴</div>
        <nav className="side-menu">
          <Link className={section==="dashboard"?"active":""} href={`${base}/dashboard`}>대시보드</Link>
          <Link className={section==="items"?"active":""} href={`${base}/items`}>물품관리</Link>
          <button onClick={openNew}><Plus size={16} /> 물품등록</button>
          <Link className={section==="qr"?"active":""} href={`${base}/qr`}>QR 관리</Link>
          <button onClick={excel}><Download size={16} /> Excel 다운로드</button>
        </nav>
        <div className="side-bottom"><div className="current-org"><span>현재 물품대장</span><strong>{org}</strong></div><button className="btn block" onClick={logout}><LogOut size={15} /> 로그아웃</button></div>
      </aside>

      <main className="main">
        <header className="topbar"><div style={{display:"flex",alignItems:"center",gap:10}}><button className="mobile-toggle" onClick={()=>setSidebarOpen(!sidebarOpen)}><Menu /></button><h1>{title}</h1></div><span className="badge">{org} 관리자</span></header>
        <div className="content">
          {section === "dashboard" && <>
            <div className="page-head"><div><h2>{title}</h2><p>현재 선택된 물품대장의 현황을 확인합니다.</p></div><button className="btn primary" onClick={openNew}><Plus size={16}/> 물품 등록</button></div>
            <div className="stats"><div className="card stat"><span>전체 물품 수</span><strong>{items.length}</strong></div><div className="card stat"><span>물품유형 수</span><strong>{allTypes.length}</strong></div><div className="card stat"><span>보관장소 수</span><strong>{locations}</strong></div><div className="card stat"><span>최근 30일 등록</span><strong>{recent}</strong></div></div>
            <div className="card"><div className="toolbar"><strong>최근 등록 물품</strong><div className="grow"/><Link className="btn small" href={`${base}/items`}>전체 보기</Link></div><ItemsTable items={items.slice(0,5)} loading={loading} onEdit={openEdit} compact /></div>
          </>}

          {section === "items" && <>
            <div className="page-head"><div><h2>{title}</h2><p>물품의 모든 내부 정보를 조회·수정하고 공개 QR 페이지를 관리합니다.</p></div><button className="btn primary" onClick={openNew}><Plus size={16}/> 물품 등록</button></div>
            <div className="card"><div className="toolbar"><input className="input" style={{maxWidth:340}} placeholder="관리번호, 품명, 장소, 책임자 검색" value={search} onChange={(e)=>setSearch(e.target.value)}/><select className="select" style={{maxWidth:220}} value={type} onChange={(e)=>setType(e.target.value)}><option value="">전체 물품유형</option>{allTypes.map(t=><option key={t}>{t}</option>)}</select><div className="grow"/><button className="btn" onClick={excel}><Download size={15}/> Excel 다운로드</button></div><ItemsTable items={items} loading={loading} onEdit={openEdit} /></div>
          </>}

          {section === "qr" && <>
            <div className="page-head">
              <div><h2>{title}</h2><p>폼텍 3104 규격으로 라벨 이미지를 구성하고, 전체 QR을 일괄 출력할 수 있습니다.</p></div>
              <div className="actions">
                <a className="btn" href={`/api/qr-batch?org=${org}&mode=labels`} target="_blank" rel="noreferrer"><Printer size={15}/> 27칸 라벨 인쇄 / PDF</a>
                <a className="btn primary" href={`/api/qr-batch?org=${org}&mode=zip`}><Download size={15}/> 전체 QR ZIP</a>
              </div>
            </div>

            <div className="card label-config-card">
              <div className="label-config-head">
                <div>
                  <strong>라벨 오른쪽 이미지 설정</strong>
                  <p>모든 3104 라벨에 공통으로 들어갈 이미지를 지정합니다. QR은 왼쪽, 이미지는 오른쪽, 관리번호는 이미지 아래에 출력됩니다.</p>
                </div>
                <span className="badge">폼텍 3104 · 3×9 · 27칸</span>
              </div>
              {labelSettingsLoading ? <div className="empty">라벨 설정 불러오는 중...</div> : <div className="label-config-grid">
                <div className="label-preview-box">
                  <div className="label-preview-qr"><QrCode size={64}/></div>
                  <div className="label-preview-right">
                    <div className="label-preview-image">
                      {labelImageUrl ? <Image src={labelImageUrl} alt="라벨 사용자 이미지 미리보기" width={220} height={120} unoptimized style={{maxWidth:`${labelImageScale}%`,maxHeight:`${labelImageScale}%`,width:"auto",height:"auto"}}/> : <span>이미지 없음</span>}
                    </div>
                    <div className="label-preview-no">관리번호</div>
                  </div>
                </div>
                <div className="label-config-controls">
                  <div className="field">
                    <label>사용자 이미지</label>
                    <input className="input" type="file" accept="image/jpeg,image/png,image/webp" disabled={labelUploading} onChange={(e)=>uploadLabelImage(e.target.files?.[0])}/>
                    <small>{labelUploading ? "업로드 중..." : "JPG, PNG, WEBP · 최대 5MB"}</small>
                  </div>
                  <div className="field">
                    <label>이미지 크기: {labelImageScale}%</label>
                    <input type="range" min="20" max="100" step="5" value={labelImageScale} onChange={(e)=>setLabelImageScale(Number(e.target.value))}/>
                  </div>
                  <div className="actions">
                    <button className="btn primary" disabled={labelSaving || labelUploading} onClick={()=>persistLabelSettings()}>{labelSaving ? "저장 중..." : "이미지 크기 저장"}</button>
                    {labelImageUrl && <button className="btn danger" disabled={labelSaving || labelUploading} onClick={removeLabelImage}>이미지 제거</button>}
                  </div>
                </div>
              </div>}
            </div>

            {loading ? <div className="card empty">불러오는 중...</div> : items.length===0 ? <div className="card empty">등록된 물품이 없습니다.</div> : <div className="qr-grid">{items.map(i=><div className="card qr-card" key={i.id}><Image src={`/api/qr/${i.public_id}`} alt={`${i.management_no} QR`} width={112} height={112} unoptimized/><div className="meta"><strong>{i.item_name}</strong><span>{i.management_no}</span><span>{i.storage_location || "보관장소 미입력"}</span><div className="actions" style={{marginTop:9}}><a className="btn small" href={`/api/qr/${i.public_id}`} download={`${i.organization}-${i.management_no}-QR.png`}><Download size={13}/> QR 다운로드</a><button className="btn small" onClick={()=>printQr(i)}><Printer size={13}/> 인쇄</button><button className="btn small" onClick={()=>copyPublicUrl(i)}><Copy size={13}/> URL 복사</button><a className="btn small" href={`/item/${i.public_id}`} target="_blank" rel="noreferrer"><ExternalLink size={13}/> 공개보기</a></div></div></div>)}</div>}
          </>}
        </div>
      </main>

      {editing !== undefined && <ItemModal form={form} field={field} editing={editing} close={()=>setEditing(undefined)} save={save} remove={remove} saving={saving} uploading={uploading} uploadPhoto={uploadPhoto} />}
    </div>
  );
}

function ItemsTable({ items, loading, onEdit, compact=false }: { items: InventoryItem[]; loading:boolean; onEdit:(i:InventoryItem)=>void; compact?:boolean }) {
  if (loading) return <div className="empty">불러오는 중...</div>;
  if (!items.length) return <div className="empty">등록된 물품이 없습니다.</div>;
  return <div className="table-wrap"><table><thead><tr><th>사진</th><th>관리번호</th><th>품명</th><th>물품유형</th>{!compact&&<><th>규격</th><th>취득일자</th></>}<th>보관장소</th><th>관리책임자(정)</th>{!compact&&<th>관리</th>}</tr></thead><tbody>{items.map(i=><tr key={i.id}><td>{i.photo_url?<Image className="thumb" src={i.photo_url} alt="" width={52} height={52}/>:<div className="thumb"/>}</td><td>{i.management_no}</td><td><strong>{i.item_name}</strong></td><td>{i.item_type}</td>{!compact&&<><td>{i.specification||"-"}</td><td>{i.acquired_date?.slice(0,10)||"-"}</td></>}<td>{i.storage_location||"-"}</td><td>{i.manager_main||"-"}</td>{!compact&&<td><div className="actions"><button className="btn small" onClick={()=>onEdit(i)}><Pencil size={13}/> 수정</button><a className="btn small" href={`/api/qr/${i.public_id}`} target="_blank"><QrCode size={13}/> QR</a><a className="btn small" href={`/item/${i.public_id}`} target="_blank" rel="noreferrer"><ExternalLink size={13}/> 공개</a></div></td>}</tr>)}</tbody></table></div>;
}

function ItemModal({ form, field, editing, close, save, remove, saving, uploading, uploadPhoto }: { form:Form; field:<K extends keyof Form>(key:K,value:Form[K])=>void; editing:InventoryItem|null; close:()=>void; save:()=>void; remove:()=>void; saving:boolean; uploading:boolean; uploadPhoto:(f?:File)=>void; }) {
  const fields: Array<[keyof Form,string,string?]> = [
    ["manager_main","관리책임자(정)"],["manager_sub","관리책임자(부)"],["management_no","관리번호 *"],["item_type","물품유형 *"],["acquired_date","취득일자","date"],["item_name","품명 *"],["purchase_price","구매단가","number"],["useful_life_years","내용년수","number"],["storage_location","보관장소"],["specification","규격"],["classification_no","물품분류번호"],["identification_no","물품식별번호"]
  ];
  return <div className="modal-backdrop"><div className="modal"><div className="modal-head"><strong>{editing?"물품 수정":"물품 등록"}</strong><button className="btn small" onClick={close}><X size={14}/> 닫기</button></div><div className="modal-body"><div className="form-grid">{fields.map(([k,label,type])=><div className="field" key={k}><label>{label}</label><input className="input" type={type||"text"} value={form[k]} onChange={(e)=>field(k,e.target.value as never)}/></div>)}<div className="field full"><label>기타구성품</label><textarea className="textarea" rows={3} value={form.accessories} onChange={(e)=>field("accessories",e.target.value)}/></div><div className="field"><label>소속 물품대장</label><select className="select" value={form.organization} onChange={(e)=>field("organization",e.target.value as Organization)}><option>CBGC</option><option>CBCKL</option></select></div><div className="field"><label>물품사진</label><input className="input" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e)=>uploadPhoto(e.target.files?.[0])}/>{uploading&&<small>업로드 중...</small>}{form.photo_url&&<Image className="preview" src={form.photo_url} alt="물품사진 미리보기" width={160} height={110}/>}</div></div></div><div className="modal-foot">{editing&&<button className="btn danger" onClick={remove}><Trash2 size={15}/> 삭제</button>}<div style={{flex:1}}/><button className="btn" onClick={close}>취소</button><button className="btn primary" disabled={saving||uploading} onClick={save}>{saving?"저장 중...":"저장"}</button></div></div></div>;
}
