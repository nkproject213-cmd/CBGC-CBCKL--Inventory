"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Menu, Plus, Download, Upload, Camera, Users, LogOut, Pencil, QrCode, ExternalLink, Trash2, X } from "lucide-react";
import type { InventoryItem, Organization } from "@/lib/types";
import { compressItemPhoto } from "@/lib/item-photo";
import PhotoArchiveButton from "@/components/PhotoArchiveButton";
import { EXPIRED_STATUS, hasUsefulLifeExpired, koreaToday, usefulLifeEnd } from "@/lib/lifecycle";

type Section = "dashboard" | "items";
type SortKey = "default" | "management_no" | "item_name" | "item_type" | "acquired_date" | "storage_location" | "manager_main" | "updated_at";
type SortDirection = "asc" | "desc";
type Form = {
  organization: Organization; manager_main: string; manager_sub: string; management_no: string; item_type: string;
  acquired_date: string; item_name: string; model_name: string; purchase_price: string; useful_life_years: string; storage_location: string;
  accessories: string; specification: string; classification_no: string; identification_no: string; photo_url: string;
  unit: string; quantity: string; item_status: string;
};
const emptyForm = (org: Organization): Form => ({ organization: org, manager_main:"",manager_sub:"",management_no:"",item_type:"",acquired_date:"",item_name:"",model_name:"",purchase_price:"",useful_life_years:"",storage_location:"",accessories:"",specification:"",classification_no:"",identification_no:"",photo_url:"",unit:"",quantity:"",item_status:"" });
export default function AdminConsole({ org, section }: { org: Organization; section: Section }) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [expiredOnly, setExpiredOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("default");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null | undefined>(undefined);
  const [form, setForm] = useState<Form>(emptyForm(org));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [bulkManagerMain, setBulkManagerMain] = useState("");
  const [bulkManagerSub, setBulkManagerSub] = useState("");
  const [bulkManagerSaving, setBulkManagerSaving] = useState(false);
  const [excelUploading, setExcelUploading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deletingSelected, setDeletingSelected] = useState(false);
  const excelInputRef = useRef<HTMLInputElement>(null);
  const autoEditDone = useRef(false);
  const loadSequence = useRef(0);
  const loadedDay = useRef("");
  const colors = org === "CBGC" ? { primary: "#00a8a8", dark: "#008c8c" } : { primary: "#ea5b96", dark: "#cf3d7d" };
  const base = `/admin/${org.toLowerCase()}`;
  async function load() {
    const sequence = ++loadSequence.current;
    setLoading(true); setSelectedIds(new Set());
    const params = new URLSearchParams({ org }); if (search) params.set("q", search); if (type) params.set("type", type);
    try {
      const res = await fetch(`/api/items?${params}`, { cache: "no-store" });
      if (sequence !== loadSequence.current) return;
      if (res.status === 401) { location.href = "/admin/login"; return; }
      const body = await res.json(); if (sequence !== loadSequence.current) return;
      if (!res.ok) throw new Error(body.error || "물품을 불러오지 못했습니다.");
      setItems(body.items || []); loadedDay.current = koreaToday();
    } catch (e) { if (sequence === loadSequence.current) alert(e instanceof Error ? e.message : "물품을 불러오지 못했습니다."); }
    finally { if (sequence === loadSequence.current) setLoading(false); }
  }
  useEffect(() => {
    void load();
    const checkDate = () => { if (document.visibilityState === "visible" && loadedDay.current !== koreaToday()) void load(); };
    const timer = window.setInterval(checkDate, 60000);
    window.addEventListener("focus", checkDate); document.addEventListener("visibilitychange", checkDate);
    return () => { loadSequence.current++; clearInterval(timer); window.removeEventListener("focus", checkDate); document.removeEventListener("visibilitychange", checkDate); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org, search, type]);
  useEffect(() => { setForm(emptyForm(org)); setExpiredOnly(false); }, [org]);
  useEffect(() => { setSelectedIds(new Set()); }, [expiredOnly]);
  useEffect(() => {
    if (autoEditDone.current || loading) return;
    const publicId = new URLSearchParams(window.location.search).get("edit");
    if (!publicId) { autoEditDone.current = true; return; }
    const target = items.find(item => item.public_id === publicId);
    if (target) { autoEditDone.current = true; openEdit(target); }
  }, [items, loading]);

  const allTypes = useMemo(() => [...new Set(items.map(i => i.item_type).filter(t => t?.trim()))].sort(), [items]);
  const expiredCount = useMemo(() => items.filter(i => i.item_status === EXPIRED_STATUS).length, [items]);
  const sortedItems = useMemo(() => {
    const visible = expiredOnly ? items.filter(i => i.item_status === EXPIRED_STATUS) : items;
    if (sortKey === "default") return visible;
    return [...visible].sort((a, b) => {
      const result = (a[sortKey] || "").localeCompare(b[sortKey] || "", "ko-KR", {numeric:true,sensitivity:"base"});
      return sortDirection === "asc" ? result : -result;
    });
  }, [items, sortKey, sortDirection, expiredOnly]);
  const locations = useMemo(() => new Set(items.map(i => i.storage_location).filter(Boolean)).size, [items]);
  const recent = useMemo(() => items.filter(i => new Date(i.created_at).getTime() >= Date.now() - 30 * 86400000).length, [items]);
  function openNew() { setEditing(null); setForm(emptyForm(org)); }
  function openEdit(i: InventoryItem) {
    setEditing(i);
    setForm({ organization:i.organization, manager_main:i.manager_main||"", manager_sub:i.manager_sub||"", management_no:i.management_no, item_type:i.item_type || "", acquired_date:i.acquired_date?.slice(0,10)||"", item_name:i.item_name, model_name:i.model_name||"", purchase_price:i.purchase_price == null ? "" : String(i.purchase_price), useful_life_years:i.useful_life_years == null ? "" : String(i.useful_life_years), storage_location:i.storage_location||"", accessories:i.accessories||"", specification:i.specification||"", classification_no:i.classification_no||"", identification_no:i.identification_no||"", photo_url:i.photo_url||"", unit:i.unit||"", quantity:i.quantity == null ? "" : String(i.quantity), item_status:(i.life_expiry_auto ? i.status_before_life_expiry : i.item_status)||"" });
  }
  function field<K extends keyof Form>(key: K, value: Form[K]) { setForm(p => ({...p,[key]:value})); }
  async function uploadPhoto(file?: File) {
    if (!file) return;
    if (!["image/jpeg","image/png","image/webp"].includes(file.type)) { alert("JPG, PNG, WEBP 사진만 업로드할 수 있습니다."); return; }
    setUploading(true);
    try {
      const fd = new FormData(); fd.append("file", await compressItemPhoto(file));
      const res = await fetch("/api/upload", {method:"POST",body:fd}); const body = await res.json();
      if (!res.ok) throw new Error(body.error || "업로드 실패"); field("photo_url", body.url);
    } catch (e) { alert(e instanceof Error ? e.message : "사진 업로드에 실패했습니다."); }
    finally { setUploading(false); }
  }
  async function save() {
    if (!form.management_no.trim()) { alert("관리번호를 입력해 주세요."); return; }
    const quantity = form.quantity.trim() === "" ? null : Number(form.quantity);
    if (quantity !== null && (!Number.isInteger(quantity) || quantity < 0 || quantity > 2147483647)) { alert("수량은 0 이상의 정수로 입력해 주세요."); return; }
    const years = form.useful_life_years.trim() === "" ? null : Number(form.useful_life_years);
    if (years !== null && (!Number.isInteger(years) || years < 0 || years > 9999)) { alert("내용연수는 0 이상 9,999 이하의 정수로 입력해 주세요."); return; }
    setSaving(true);
    try {
      const payload = { ...form, model_name:form.model_name.trim()||null, quantity, unit:form.unit.trim()||null, item_status:form.item_status.trim()||null, purchase_price:form.purchase_price === "" ? null : Number(form.purchase_price), useful_life_years:years, acquired_date:form.acquired_date||null, manager_main:form.manager_main||null, manager_sub:form.manager_sub||null, storage_location:form.storage_location||null, accessories:form.accessories||null, specification:form.specification||null, classification_no:form.classification_no||null, identification_no:form.identification_no||null, photo_url:form.photo_url||null };
      const res = await fetch(editing ? `/api/items/${editing.id}` : "/api/items", {method:editing?"PATCH":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
      const body = await res.json(); if (!res.ok) throw new Error(body.error || "저장에 실패했습니다.");
      setEditing(undefined);
      if (payload.organization !== org) { location.href = `/admin/${payload.organization.toLowerCase()}/items`; return; }
      await load();
    } catch (e) { alert(e instanceof Error ? e.message : "저장에 실패했습니다."); }
    finally { setSaving(false); }
  }
  async function remove() {
    if (!editing || !confirm("정말 이 물품을 삭제하시겠습니까?")) return;
    const res = await fetch(`/api/items/${editing.id}`, {method:"DELETE"});
    if (!res.ok) { const body=await res.json(); alert(body.error||"삭제 실패"); return; }
    setEditing(undefined); await load();
  }
  async function applyBulkManagers() {
    if (!bulkManagerMain.trim() && !bulkManagerSub.trim()) { alert("관리책임자(정) 또는 관리책임자(부) 중 하나 이상 입력해 주세요."); return; }
    if (!confirm(`${org} 전체 물품의 관리책임자를 일괄 변경하시겠습니까?\n입력하지 않은 칸은 기존 값을 유지합니다.`)) return;
    setBulkManagerSaving(true);
    try {
      const res = await fetch("/api/items/bulk-managers", {method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({organization:org,manager_main:bulkManagerMain,manager_sub:bulkManagerSub})});
      const body = await res.json(); if (!res.ok) throw new Error(body.error || "일괄 적용 실패");
      alert(`${body.updated||0}개 물품에 관리책임자를 적용했습니다.`); await load();
    } catch (e) { alert(e instanceof Error ? e.message : "관리책임자 일괄 적용에 실패했습니다."); }
    finally { setBulkManagerSaving(false); }
  }
  async function uploadExcel(file?: File) {
    if (!file || excelUploading) return;
    if (!file.name.toLowerCase().endsWith(".xlsx") || file.size > 4*1024*1024) { alert("4MB 이하의 XLSX 파일을 선택해 주세요."); if(excelInputRef.current)excelInputRef.current.value=""; return; }
    if (!confirm(`${org} 물품대장에 엑셀을 반영하시겠습니까?\n\n같은 관리번호: 입력한 값만 수정\n빈칸·없는 열·엑셀에 없는 물품: 기존 내용 유지\n새 관리번호: 관리번호만 있어도 신규 등록\n취득일자·내용연수에 따라 경과 상태는 자동 반영`)) { if(excelInputRef.current)excelInputRef.current.value=""; return; }
    setExcelUploading(true);
    try {
      const fd = new FormData(); fd.append("file",file); fd.append("organization",org);
      const res = await fetch("/api/items/import",{method:"POST",body:fd}); const body=await res.json();
      if(!res.ok)throw new Error(body.error||"엑셀 업로드 실패");
      const errorText=Array.isArray(body.errors)&&body.errors.length?`\n\n오류 내역:\n${body.errors.join("\n")}${body.failed>body.errors.length?`\n외 ${body.failed-body.errors.length}건`:""}`:"";
      alert(`엑셀 반영 완료\n신규 등록: ${body.created||0}건\n수정: ${body.updated||0}건\n변경 없음: ${body.unchanged||0}건\n실패: ${body.failed||0}건${errorText}`); await load();
    } catch(e) { alert(e instanceof Error?e.message:"엑셀 업로드에 실패했습니다."); }
    finally { setExcelUploading(false); if(excelInputRef.current)excelInputRef.current.value=""; }
  }
  function toggleSelected(id:string) { setSelectedIds(current=>{const next=new Set(current); if(next.has(id))next.delete(id);else next.add(id);return next;}); }
  function toggleAllVisible(checked:boolean) { setSelectedIds(checked?new Set(sortedItems.map(i=>i.id)):new Set()); }
  async function deleteSelectedItems() {
    // Selection must never act on hidden items after a filter change.
    const ids=sortedItems.filter(i=>selectedIds.has(i.id)).map(i=>i.id);
    if(!ids.length){alert("삭제할 물품을 선택해 주세요.");return;}
    if(!confirm(`선택한 ${ids.length}개 물품을 삭제하시겠습니까?\n삭제 후에는 되돌릴 수 없습니다.`))return;
    setDeletingSelected(true);
    try {
      const res=await fetch("/api/items/bulk-delete",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({organization:org,ids})});const body=await res.json();
      if(!res.ok)throw new Error(body.error||"선택삭제 실패");
      alert(`${body.deleted||0}개 물품을 삭제했습니다.`);setSelectedIds(new Set());await load();
    } catch(e){alert(e instanceof Error?e.message:"선택삭제에 실패했습니다.");}finally{setDeletingSelected(false);}
  }
  async function logout(){await fetch("/api/auth/logout",{method:"POST"});location.href="/admin/login";}
  function excel(){const p=new URLSearchParams({org});if(search)p.set("q",search);if(type)p.set("type",type);if(expiredOnly)p.set("expired","1");location.href=`/api/export?${p}`;}
  const title=section==="dashboard"?`${org} 물품관리 대시보드`:`${org} 물품관리`;
  return <div className="admin" style={{"--primary":colors.primary,"--primary-dark":colors.dark} as React.CSSProperties}>
    <aside className={`sidebar ${sidebarOpen?"open":""}`}><div className="logo">CBGC · CBCKL<small>통합 물품관리 시스템</small></div><div className="side-label">물품대장 선택</div>
      <div className="org-switch"><Link className={org==="CBGC"?"active":""} href="/admin/cbgc/dashboard">CBGC</Link><Link className={org==="CBCKL"?"active":""} href="/admin/cbckl/dashboard">CBCKL</Link></div>
      <div className="side-label">관리 메뉴</div><nav className="side-menu"><Link className={section==="dashboard"?"active":""} href={`${base}/dashboard`}>대시보드</Link><Link className={section==="items"?"active":""} href={`${base}/items`}>물품관리</Link><button onClick={openNew}><Plus size={16}/> 물품등록</button><Link href={`${base}/qr`}>QR 관리</Link><button onClick={excel}><Download size={16}/> Excel 다운로드</button></nav>
      <div className="side-bottom"><div className="current-org"><span>현재 물품대장</span><strong>{org}</strong></div><button className="btn block" onClick={logout}><LogOut size={15}/> 로그아웃</button></div>
    </aside>
    <main className="main"><header className="topbar"><div style={{display:"flex",alignItems:"center",gap:10}}><button className="mobile-toggle" onClick={()=>setSidebarOpen(!sidebarOpen)}><Menu/></button><h1>{title}</h1></div><span className="badge">{org} 관리자</span></header>
      <div className="content">
        {section==="dashboard"&&<><div className="page-head"><div><h2>{title}</h2><p>현재 선택된 물품대장의 현황을 확인합니다.</p></div><button className="btn primary" onClick={openNew}><Plus size={16}/> 물품 등록</button></div>
          <div className="stats"><div className="card stat"><span>전체 물품 수</span><strong>{items.length}</strong></div><div className="card stat"><span>물품유형 수</span><strong>{allTypes.length}</strong></div><div className="card stat"><span>보관장소 수</span><strong>{locations}</strong></div><div className="card stat"><span>최근 30일 등록</span><strong>{recent}</strong></div></div>
          <div className="card"><div className="toolbar"><strong>최근 등록 물품</strong><div className="grow"/><Link className="btn small" href={`${base}/items`}>전체 보기</Link></div><ItemsTable items={items.slice(0,5)} loading={loading} onEdit={openEdit} compact/></div></>}
        {section==="items"&&<>
          <div className="page-head"><div><h2>{title}</h2><p>물품의 모든 내부 정보를 조회·수정하고 공개 QR 페이지를 관리합니다.</p></div>
            <div className="actions" style={{alignItems:"flex-start",gap:8}}><div style={{display:"flex",flexDirection:"column",gap:4}}><div className="actions">
              <input className="input" style={{width:125}} placeholder="책임자(정)" value={bulkManagerMain} onChange={e=>setBulkManagerMain(e.target.value)}/><input className="input" style={{width:125}} placeholder="책임자(부)" value={bulkManagerSub} onChange={e=>setBulkManagerSub(e.target.value)}/><button className="btn" disabled={bulkManagerSaving} onClick={applyBulkManagers}><Users size={15}/>{bulkManagerSaving?" 적용 중...":" 책임자 일괄 적용"}</button>
            </div><span style={{fontSize:11,color:"var(--muted)"}}>빈 칸은 기존 값 유지 · 현재 {org} 전체 물품에 적용</span></div><button className="btn primary" onClick={openNew}><Plus size={16}/> 물품 등록</button></div>
          </div>
          <p style={{fontSize:12,color:"var(--muted)",margin:"0 0 12px"}}>엑셀은 관리번호 기준으로 입력한 값만 수정합니다. 취득일자 + 내용연수 도래 시 상태가 자동으로 ‘내용연수 경과’로 바뀝니다.</p>
          <div className="card"><div className="toolbar">
            <input className="input" style={{maxWidth:340}} placeholder="관리번호, 품명, 장소, 책임자 검색" value={search} onChange={e=>setSearch(e.target.value)}/>
            <select className="select" style={{maxWidth:220}} value={type} onChange={e=>setType(e.target.value)}><option value="">전체 물품유형</option>{allTypes.map(t=><option key={t}>{t}</option>)}</select>
            <select className="select" style={{maxWidth:170}} value={sortKey} onChange={e=>setSortKey(e.target.value as SortKey)}><option value="default">기본 정렬</option><option value="management_no">관리번호</option><option value="item_name">품명</option><option value="item_type">물품유형</option><option value="acquired_date">취득일자</option><option value="storage_location">보관장소</option><option value="manager_main">관리책임자(정)</option><option value="updated_at">수정일</option></select>
            <select className="select" style={{maxWidth:130}} value={sortDirection} onChange={e=>setSortDirection(e.target.value as SortDirection)} disabled={sortKey==="default"}><option value="asc">오름차순</option><option value="desc">내림차순</option></select><div className="grow"/>
            <input ref={excelInputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={e=>uploadExcel(e.target.files?.[0])}/><a className="btn" href="/api/items/import-template"><Download size={15}/> 업로드 양식</a><button className="btn" disabled={excelUploading} onClick={()=>excelInputRef.current?.click()}><Upload size={15}/>{excelUploading?" 업로드 중...":" 엑셀 업로드"}</button><button className="btn" onClick={excel}><Download size={15}/> Excel 다운로드</button><PhotoArchiveButton org={org}/>
            <button className="btn danger" disabled={deletingSelected||loading||selectedIds.size===0} onClick={deleteSelectedItems}><Trash2 size={15}/>{deletingSelected?" 삭제 중...":` 선택삭제 (${selectedIds.size})`}</button>
          </div><div className="toolbar" style={{borderTop:"1px solid var(--border)",gap:14}}>
            <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontWeight:700,fontSize:13}}><input type="checkbox" checked={expiredOnly} onChange={e=>setExpiredOnly(e.target.checked)}/> 내용연수 경과만 보기 ({expiredCount})</label>
            <span style={{fontSize:12,color:"var(--muted)"}}>현재 {sortedItems.length}개 표시 · 한국 날짜 기준 · 엑셀 다운로드에도 경과 필터 적용</span>
          </div><ItemsTable items={sortedItems} loading={loading} onEdit={openEdit} selectedIds={selectedIds} onToggleSelected={toggleSelected} onToggleAll={toggleAllVisible}/></div>
        </>}
      </div>
    </main>
    {editing!==undefined&&<ItemModal form={form} field={field} editing={editing} close={()=>setEditing(undefined)} save={save} remove={remove} saving={saving} uploading={uploading} uploadPhoto={uploadPhoto}/>}
  </div>;
}
function ItemsTable({items,loading,onEdit,compact=false,selectedIds,onToggleSelected,onToggleAll}:{items:InventoryItem[];loading:boolean;onEdit:(i:InventoryItem)=>void;compact?:boolean;selectedIds?:Set<string>;onToggleSelected?:(id:string)=>void;onToggleAll?:(checked:boolean)=>void}) {
  if(loading)return <div className="empty">불러오는 중...</div>;
  if(!items.length)return <div className="empty">표시할 물품이 없습니다. 검색어나 필터를 확인해 주세요.</div>;
  const selectable=Boolean(!compact&&selectedIds&&onToggleSelected&&onToggleAll), allSelected=selectable&&items.every(i=>selectedIds?.has(i.id));
  return <div className="table-wrap"><table><thead><tr>{selectable&&<th style={{width:42,textAlign:"center"}}><input type="checkbox" aria-label="현재 목록 전체 선택" checked={allSelected} onChange={e=>onToggleAll?.(e.target.checked)}/></th>}<th>사진</th><th>관리번호</th><th>품명</th><th>물품유형</th>{!compact&&<><th>규격</th><th>취득일자</th><th>상태</th></>}<th>보관장소</th><th>관리책임자(정)</th>{!compact&&<th>관리</th>}</tr></thead><tbody>{items.map(i=><tr key={i.id}>
    {selectable&&<td style={{textAlign:"center"}}><input type="checkbox" aria-label={`${i.management_no} 선택`} checked={selectedIds?.has(i.id)||false} onChange={()=>onToggleSelected?.(i.id)}/></td>}
    <td>{i.photo_url?<Image className="thumb" src={i.photo_url} alt="" width={52} height={52}/>:<div className="thumb"/>}</td><td>{i.management_no}</td><td><strong>{i.item_name || "-"}</strong></td><td>{i.item_type || "-"}</td>
    {!compact&&<><td>{i.specification||"-"}</td><td>{i.acquired_date?.slice(0,10)||"-"}</td><td><span style={i.item_status===EXPIRED_STATUS?{fontWeight:700,color:"#b42318",whiteSpace:"nowrap"}:undefined}>{i.item_status||"-"}</span></td></>}
    <td>{i.storage_location||"-"}</td><td>{i.manager_main||"-"}</td>{!compact&&<td><div className="actions"><button className="btn small" onClick={()=>onEdit(i)}><Pencil size={13}/> 수정 및 상세</button><a className="btn small" href={`/api/qr/${i.public_id}`} target="_blank" rel="noreferrer"><QrCode size={13}/> QR</a><a className="btn small" href={`/item/${i.public_id}`} target="_blank" rel="noreferrer"><ExternalLink size={13}/> 공개</a></div></td>}
  </tr>)}</tbody></table></div>;
}
function ItemModal({form,field,editing,close,save,remove,saving,uploading,uploadPhoto}:{form:Form;field:<K extends keyof Form>(key:K,value:Form[K])=>void;editing:InventoryItem|null;close:()=>void;save:()=>void;remove:()=>void;saving:boolean;uploading:boolean;uploadPhoto:(f?:File)=>void}) {
  const fields:Array<[keyof Form,string,string?]>=[
    ["manager_main","관리책임자(정)"],["manager_sub","관리책임자(부)"],["management_no","관리번호 *"],["item_type","물품유형"],["acquired_date","취득일자","date"],["item_name","품명"],["model_name","모델명"],["unit","단위"],["quantity","수량","number"],["item_status","상태"],["purchase_price","구매단가","number"],["useful_life_years","내용연수","number"],["storage_location","위치(보관장소)"],["specification","규격"],["classification_no","물품분류번호"],["identification_no","물품식별번호"]
  ];
  const modified=editing?new Date(editing.updated_at):null;
  const years=form.useful_life_years.trim()===""?null:Number(form.useful_life_years);
  const expired=hasUsefulLifeExpired(form.acquired_date,years), end=usefulLifeEnd(form.acquired_date,years);
  return <div className="modal-backdrop"><div className="modal"><div className="modal-head"><strong>{editing?"물품 수정 및 상세":"물품 등록"}</strong><button className="btn small" onClick={close}><X size={14}/> 닫기</button></div><div className="modal-body">
    {editing&&<div className="detail-meta"><span>최종 수정일시</span><strong>{modified&&!Number.isNaN(modified.getTime())?new Intl.DateTimeFormat("ko-KR",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false,timeZone:"Asia/Seoul"}).format(modified):"-"}</strong></div>}
    <p style={{fontSize:12,color:expired?"#b42318":"var(--muted)"}}>{end?`내용연수 도래일: ${end} · ${expired?"내용연수 경과로 자동 저장됩니다.":"아직 경과하지 않았습니다."}`:"취득일자와 내용연수를 입력하면 경과 상태를 자동 판정합니다."}{expired&&` 기존 상태: ${form.item_status||"미입력"} (별도 보관)`}</p>
    <div className="form-grid">{fields.map(([key,label,inputType])=><div className="field" key={key}><label htmlFor={`item-${key}`}>{label}</label><input id={`item-${key}`} className="input" type={inputType||"text"} value={key==="item_status"&&expired?EXPIRED_STATUS:form[key]} readOnly={key==="item_status"&&expired} min={key==="quantity"||key==="useful_life_years"?0:undefined} step={key==="quantity"||key==="useful_life_years"?1:undefined} onChange={e=>field(key,e.target.value as never)}/></div>)}
      <div className="field full"><label>기타구성품</label><textarea className="textarea" rows={3} value={form.accessories} onChange={e=>field("accessories",e.target.value)}/></div><div className="field"><label>소속 물품대장</label><select className="select" value={form.organization} onChange={e=>field("organization",e.target.value as Organization)}><option>CBGC</option><option>CBCKL</option></select></div>
      <div className="field"><label>물품사진</label><div className="actions"><label className="btn"><Upload size={15}/> 사진 선택<input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={uploading} onChange={e=>{uploadPhoto(e.target.files?.[0]);e.currentTarget.value="";}}/></label><label className="btn"><Camera size={15}/> 카메라 촬영<input type="file" accept="image/*" capture="environment" hidden disabled={uploading} onChange={e=>{uploadPhoto(e.target.files?.[0]);e.currentTarget.value="";}}/></label></div><small>업로드 전 자동으로 250KB 이하로 압축됩니다.</small>{uploading&&<small> 사진 압축 및 업로드 중...</small>}{form.photo_url&&<Image className="preview" src={form.photo_url} alt="물품사진 미리보기" width={160} height={110}/>}</div>
    </div></div><div className="modal-foot">{editing&&<button className="btn danger" onClick={remove}><Trash2 size={15}/> 삭제</button>}<div style={{flex:1}}/><button className="btn" onClick={close}>취소</button><button className="btn primary" disabled={saving||uploading} onClick={save}>{saving?"저장 중...":"저장"}</button></div>
  </div></div>;
}
