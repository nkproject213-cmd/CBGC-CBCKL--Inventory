"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type MouseEvent } from "react";
import QRCode from "qrcode";
import { Menu, Save, Printer, Download, RotateCcw, Move, ImagePlus, QrCode, List, ArrowUp, ArrowDown, LogOut, ExternalLink, Pencil, Copy } from "lucide-react";
import type { InventoryItem, Organization } from "@/lib/types";
import { BLOCK_KEYS, FIELD_NAMES, LABEL_WIDTH, LABEL_HEIGHT, LABEL_CSS, boundBox, defaultLayout, fitInformation, imageFor, informationHtml, layoutIssues, parseLayout, safeImageUrl, type BlockKey, type Box, type QrLayout, type LabelData } from "@/lib/qr-layout";
import styles from "./QRManagement.module.css";

type Snapshot = { layout: QrLayout; revision: number; updated_at: string | null };
type Drag = { key: BlockKey; mode: "move" | "resize"; startX: number; startY: number; box: Box; pixelsPerMm: number; element: HTMLElement };
const BLOCK_NAMES: Record<BlockKey, string> = { qr: "QR", image: "이미지", info: "정보" };
const SAMPLE: LabelData = { public_id: "00000000-0000-4000-8000-000000000000", item_name: "미리보기 예시 물품", management_no: "예시-001", specification: "규격", acquired_date: "2026-01-01", storage_location: "보관장소", manager_main: "담당자(정)", manager_sub: "담당자(부)", photo_url: null };
const BASE_WIDTH = LABEL_WIDTH * 96 / 25.4;
const BASE_HEIGHT = LABEL_HEIGHT * 96 / 25.4;

export default function QRManagement({ org }: { org: Organization }) {
  const [layout, setLayout] = useState<QrLayout>(defaultLayout);
  const [saved, setSaved] = useState<Snapshot | null>(null);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [itemId, setItemId] = useState("");
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<BlockKey>("qr");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [grid, setGrid] = useState(true);
  const [scale, setScale] = useState(2);
  const [qrSvg, setQrSvg] = useState("");
  const [qrError, setQrError] = useState("");
  const [overflow, setOverflow] = useState<string[]>([]);
  const [imageError, setImageError] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const dock = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const busy = saving || uploading;
  const dirty = saved !== null && JSON.stringify(layout) !== JSON.stringify(saved.layout);
  const issues = useMemo(() => layoutIssues(layout), [layout]);
  const current: LabelData = items.find(item => item.public_id === itemId) || items[0] || SAMPLE;
  const image = imageFor(current, layout);
  const base = `/admin/${org.toLowerCase()}`;
  const colors = org === "CBGC" ? { primary: "#00a8a8", dark: "#008c8c" } : { primary: "#ea5b96", dark: "#cf3d7d" };
  const filtered = useMemo(() => items.filter(i => `${i.management_no} ${i.item_name}`.toLowerCase().includes(search.trim().toLowerCase())), [items, search]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / 12));
  const visible = filtered.slice(Math.min(page, pageCount - 1) * 12, (Math.min(page, pageCount - 1) + 1) * 12);

  useEffect(() => {
    const controller = new AbortController();
    async function read(url: string) {
      const response = await fetch(url, { cache: "no-store", signal: controller.signal });
      if (response.status === 401) { location.href = `/admin/login?next=${encodeURIComponent(`${base}/qr`)}`; throw new Error("관리자 로그인이 필요합니다."); }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "데이터를 불러오지 못했습니다.");
      return data;
    }
    Promise.all([read(`/api/qr-layout?org=${org}`), read(`/api/items?org=${org}`)]).then(([settings, result]) => {
      if (controller.signal.aborted) return;
      const snapshot: Snapshot = { layout: parseLayout(settings.layout), revision: settings.revision, updated_at: settings.updated_at };
      const data: InventoryItem[] = result.items || [];
      data.sort((a, b) => a.management_no.localeCompare(b.management_no, "ko", { numeric: true, sensitivity: "base" }));
      setLayout(snapshot.layout); setSaved(snapshot); setItems(data); setItemId(data[0]?.public_id || ""); setReady(true);
    }).catch(error => { if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : "설정을 불러오지 못했습니다."); });
    return () => controller.abort();
  }, [org, base]);

  useEffect(() => {
    if (!dock.current) return;
    const element = dock.current;
    const observer = new ResizeObserver(() => setScale(Math.max(.5, Math.min(3.2, (element.clientWidth - 32) / BASE_WIDTH))));
    observer.observe(element);
    return () => observer.disconnect();
  }, [ready]);

  useEffect(() => {
    let active = true;
    setQrSvg(""); setQrError("");
    const url = items.length ? `${window.location.origin}/item/${current.public_id}` : "https://example.invalid/preview";
    QRCode.toString(url, { type: "svg", margin: 4, errorCorrectionLevel: "M" }).then(svg => { if (active) setQrSvg(svg); }).catch(() => { if (active) setQrError("미리보기 QR 생성에 실패했습니다."); });
    return () => { active = false; };
  }, [current.public_id, items.length]);

  useLayoutEffect(() => {
    if (canvas.current) setOverflow(fitInformation(canvas.current));
  }, [layout, current, ready]);
  useEffect(() => { setImageError(false); }, [image]);
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  function leave(event: MouseEvent<HTMLAnchorElement>) {
    if ((dirty || busy) && !confirm("저장하지 않은 레이아웃이 있습니다. 이동하시겠습니까?")) event.preventDefault();
  }
  function setBox(key: BlockKey, box: Box) { setLayout(previous => ({ ...previous, [key]: { ...previous[key], ...boundBox(key, box) } })); }
  function begin(event: PointerEvent<HTMLElement>, key: BlockKey, mode: "move" | "resize") {
    if (!ready || busy || event.button !== 0 || !canvas.current) return;
    event.preventDefault(); event.stopPropagation(); setSelected(key); setNotice("");
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { key, mode, startX: event.clientX, startY: event.clientY, box: { ...layout[key] }, pixelsPerMm: canvas.current.getBoundingClientRect().width / LABEL_WIDTH, element: event.currentTarget };
  }
  function move(event: PointerEvent<HTMLElement>) {
    const d = drag.current;
    if (!d) return;
    const dx = (event.clientX - d.startX) / d.pixelsPerMm, dy = (event.clientY - d.startY) / d.pixelsPerMm;
    if (d.mode === "move") setBox(d.key, { ...d.box, x: d.box.x + dx, y: d.box.y + dy });
    else {
      let width = Math.min(LABEL_WIDTH - .5 - d.box.x, d.box.width + dx);
      let height = Math.min(LABEL_HEIGHT - .5 - d.box.y, d.box.height + dy);
      if (d.key === "qr") width = height = Math.min(LABEL_WIDTH - .5 - d.box.x, LABEL_HEIGHT - .5 - d.box.y, d.box.width + Math.max(dx, dy));
      setBox(d.key, { ...d.box, width, height });
    }
  }
  function end(event: PointerEvent<HTMLElement>) {
    const element = drag.current?.element;
    if (element?.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
    drag.current = null;
  }
  function changeNumber(name: keyof Box, raw: string) {
    const value = Number(raw);
    if (!Number.isFinite(value)) return;
    const box = { ...layout[selected], [name]: value };
    if (selected === "qr" && name === "height") box.width = value;
    setBox(selected, box);
  }
  function shiftField(index: number, direction: -1 | 1) {
    const order = [...layout.info.order];
    [order[index], order[index + direction]] = [order[index + direction], order[index]];
    setLayout(previous => ({ ...previous, info: { ...previous.info, order } }));
  }
  async function save() {
    if (!saved || busy) return;
    try { parseLayout(layout); } catch (error) { setNotice(error instanceof Error ? error.message : "설정을 확인해 주세요."); return; }
    setSaving(true); setNotice("");
    try {
      const response = await fetch("/api/qr-layout", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organization: org, revision: saved.revision, layout }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "저장 실패");
      const snapshot: Snapshot = { layout: parseLayout(body.layout), revision: body.revision, updated_at: body.updated_at };
      setSaved(snapshot); setLayout(snapshot.layout); setNotice(`${org} 레이아웃을 저장했습니다. 인쇄에 동일하게 적용됩니다.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "저장에 실패했습니다."); }
    finally { setSaving(false); }
  }
  async function upload(file?: File) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setNotice("JPG, PNG, WEBP 이미지만 사용할 수 있습니다."); return; }
    if (file.size > 4 * 1024 * 1024) { setNotice("라벨 이미지는 4MB 이하로 선택해 주세요."); return; }
    setUploading(true); setNotice("");
    try {
      const data = new FormData(); data.append("file", file);
      const response = await fetch("/api/upload", { method: "POST", body: data });
      const body = await response.json();
      const url = safeImageUrl(body.url);
      if (!response.ok || !url) throw new Error(body.error || "이미지 업로드 실패");
      setLayout(previous => ({ ...previous, image: { ...previous.image, enabled: true, source: "custom", url } }));
      setNotice("이미지 업로드 완료. 레이아웃을 저장하면 인쇄에 적용됩니다.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "이미지 업로드에 실패했습니다."); }
    finally { setUploading(false); if (imageInput.current) imageInput.current.value = ""; }
  }
  function print(preview: boolean, publicId?: string) {
    if (!ready || busy || dirty || issues.length) { setNotice("겹침을 정리하고 레이아웃을 저장한 뒤 출력해 주세요."); return; }
    const params = new URLSearchParams({ org, mode: "labels" });
    if (preview) params.set("autoprint", "0");
    if (publicId) params.set("publicId", publicId);
    window.open(`/api/qr-batch?${params}`, "_blank", "noopener,noreferrer");
  }
  async function copyUrl(publicId: string) {
    try { await navigator.clipboard.writeText(`${window.location.origin}/item/${publicId}`); setNotice("공개 URL이 복사되었습니다."); }
    catch { setNotice("주소 복사에 실패했습니다. 공개보기에서 주소를 복사해 주세요."); }
  }
  async function logout() {
    if (dirty && !confirm("저장하지 않은 레이아웃이 있습니다. 로그아웃하시겠습니까?")) return;
    await fetch("/api/auth/logout", { method: "POST" }); location.href = "/admin/login";
  }
  const printDisabled = !ready || busy || dirty || !!issues.length || !items.length;
  const selectedBox = layout[selected];

  return <div className={`admin ${styles.root}`} style={{ "--primary": colors.primary, "--primary-dark": colors.dark } as CSSProperties}>
    <style>{LABEL_CSS}</style>
    <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
      <div className="logo">CBGC · CBCKL<small>통합 물품관리 시스템</small></div>
      <div className="side-label">물품대장 선택</div>
      <div className="org-switch"><Link onClick={leave} className={org === "CBGC" ? "active" : ""} href="/admin/cbgc/qr">CBGC</Link><Link onClick={leave} className={org === "CBCKL" ? "active" : ""} href="/admin/cbckl/qr">CBCKL</Link></div>
      <div className="side-label">관리 메뉴</div>
      <nav className="side-menu"><Link onClick={leave} href={`${base}/dashboard`}>대시보드</Link><Link onClick={leave} href={`${base}/items`}>물품관리</Link><Link onClick={leave} className="active" href={`${base}/qr`}>QR 관리</Link><a href={`/api/export?org=${org}`}><Download size={16}/> Excel 다운로드</a></nav>
      <div className="side-bottom"><div className="current-org"><span>현재 물품대장</span><strong>{org}</strong></div><button className="btn block" onClick={logout}><LogOut size={15}/> 로그아웃</button></div>
    </aside>
    <main className="main">
      <header className="topbar"><div className={styles.titleLine}><button className="mobile-toggle" aria-label="메뉴" onClick={() => setSidebarOpen(!sidebarOpen)}><Menu/></button><h1>{org} QR 관리</h1></div><span className="badge">{org} 관리자</span></header>
      <div className={`content ${styles.content}`}>
        <div className={styles.pageHead}><div><div className={styles.eyebrow}>FORMTEC 3104 · 3 × 9</div><h2>라벨 레이아웃 편집</h2><p>QR · 이미지 · 정보를 원하는 위치에 배치해.</p></div><div className={styles.headActions}>
          <span className={styles.status}>{dirty ? "저장하지 않은 변경사항" : ready ? `${org} 전용 레이아웃` : "설정 불러오는 중"}</span>
          <button className="btn primary" disabled={!ready || busy || !!issues.length} onClick={save}><Save size={16}/>{saving ? "저장 중…" : "레이아웃 저장"}</button>
        </div></div>
        {loadError ? <div className={styles.error} role="alert">{loadError} <button className="btn small" onClick={() => location.reload()}>새로고침</button></div> : !ready ? <div className="card empty">레이아웃과 물품을 불러오는 중…</div> : <>
          <section className={`card ${styles.editor}`} aria-label="라벨 편집기">
            <div className={styles.editorBar}><div className={styles.tabs}>{BLOCK_KEYS.map(key => <button key={key} className={selected === key ? styles.activeTab : ""} aria-pressed={selected === key} onClick={() => setSelected(key)}>{key === "qr" ? <QrCode size={15}/> : key === "image" ? <ImagePlus size={15}/> : <List size={15}/>} {BLOCK_NAMES[key]}</button>)}</div><label className={styles.check}><input type="checkbox" checked={grid} onChange={e => setGrid(e.target.checked)}/> 격자 표시</label></div>
            <div className={styles.workspace}>
              <div className={styles.previewPane}>
                <div className={styles.previewSelector}><label htmlFor="qr-preview-item">미리보기 물품</label><select id="qr-preview-item" className="select" value={itemId} onChange={e => setItemId(e.target.value)} disabled={!items.length}>{items.length ? items.map(i => <option key={i.public_id} value={i.public_id}>{i.management_no} · {i.item_name}</option>) : <option value="">예시 데이터 — 등록된 물품 없음</option>}</select></div>
                <div ref={dock} className={`${styles.canvasDock} ${grid ? styles.grid : ""}`}>
                  <div className={styles.dimension}>62.7 mm × 30.1 mm</div>
                  <div style={{ width: BASE_WIDTH * scale, height: BASE_HEIGHT * scale, position: "relative" }}>
                    <div ref={canvas} className={`ql-label ${styles.canvas}`} data-management-no={current.management_no} style={{ transform: `scale(${scale})` }}>
                      {BLOCK_KEYS.map(key => {
                        const b = layout[key], hidden = key === "image" && !layout.image.enabled;
                        if (hidden) return null;
                        return <div key={key} tabIndex={0} role="button" aria-label={`${BLOCK_NAMES[key]} 영역 이동`} aria-pressed={selected === key} data-block={key} className={`ql-block ql-${key} ${styles.block} ${selected === key ? styles.selected : ""}`} style={{ left: `${b.x}mm`, top: `${b.y}mm`, width: `${b.width}mm`, height: `${b.height}mm` }} onPointerDown={e => begin(e, key, "move")} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onFocus={() => setSelected(key)} onKeyDown={e => {
                          if (busy || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
                          e.preventDefault(); const n = e.shiftKey ? .1 : .5;
                          setBox(key, { ...b, x: b.x + (e.key === "ArrowLeft" ? -n : e.key === "ArrowRight" ? n : 0), y: b.y + (e.key === "ArrowUp" ? -n : e.key === "ArrowDown" ? n : 0) });
                        }}>
                          {key === "qr" && <div className={styles.qrContent} dangerouslySetInnerHTML={{ __html: qrSvg }}/>} 
                          {key === "image" && (image ? <img src={image} alt="라벨 이미지" draggable={false} referrerPolicy="no-referrer" onLoad={() => setImageError(false)} onError={() => setImageError(true)}/> : <span className={styles.imagePlaceholder}>이미지 영역</span>)}
                          {key === "info" && <div className={styles.infoContent} dangerouslySetInnerHTML={{ __html: informationHtml(current, layout) }}/>} 
                          {selected === key && <span role="button" aria-label={`${BLOCK_NAMES[key]} 크기 조절`} className={styles.resize} onPointerDown={e => begin(e, key, "resize")}/>}
                        </div>;
                      })}
                    </div>
                  </div>
                  <div className={styles.canvasHint}><Move size={14}/> 영역을 끌어 이동 · 오른쪽 아래 모서리로 크기 조절</div>
                </div>
                <div className={styles.previewFoot}><span>미리보기는 확대 표시야. 인쇄는 실제 mm 규격으로 출력돼.</span><span>키보드 방향키: 0.5mm / Shift + 방향키: 0.1mm</span></div>
                {issues.length > 0 && <div className={styles.warning} role="alert">{issues.map((issue, i) => <div key={i}>{issue}</div>)}</div>}
                {overflow.length > 0 && <div className={styles.warning}>일부 정보가 영역에 들어가지 않아. 정보 영역을 넓히거나 글자 크기를 줄여 줘. 출력 전에도 전체 물품을 검사해.</div>}
                {qrError && <div className={styles.warning}>{qrError}</div>}
                {imageError && <div className={styles.warning}>이미지를 불러오지 못했어. 이미지를 다시 선택해 줘.</div>}
                {layout.qr.width < 20 && <div className={styles.warning}>작은 QR은 인식이 어려울 수 있어. 실제 라벨 출력 후 스캔을 확인해 줘.</div>}
              </div>
              <aside className={styles.inspector}>
                <h3>{BLOCK_NAMES[selected]} 설정</h3><p className={styles.muted}>왼쪽 위 기준 · 단위 mm</p>
                <fieldset disabled={busy} className={styles.fieldset}>
                  <div className={styles.numbers}>{([["x", "가로 위치"], ["y", "세로 위치"], ["width", "너비"], ["height", "높이"]] as Array<[keyof Box, string]>).map(([key, label]) => <label key={key}>{label}<input type="number" aria-label={`${BLOCK_NAMES[selected]} ${label}`} step="0.1" value={selectedBox[key]} onChange={e => changeNumber(key, e.target.value)}/></label>)}</div>
                  {selected === "qr" && <p className={styles.muted}>QR은 찌그러지지 않도록 정사각형 비율을 유지해.</p>}
                  {selected === "image" && <div className={styles.extraControls}>
                    <label className={styles.check}><input type="checkbox" checked={layout.image.enabled} onChange={e => setLayout(p => ({ ...p, image: { ...p.image, enabled: e.target.checked } }))}/> 이미지 출력</label>
                    <label>이미지 종류<select value={layout.image.source} onChange={e => setLayout(p => ({ ...p, image: { ...p.image, source: e.target.value as "custom" | "item" } }))}><option value="item">각 물품의 물품사진</option><option value="custom">직접 업로드한 공통 이미지</option></select></label>
                    {layout.image.source === "custom" ? <><input ref={imageInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={e => upload(e.target.files?.[0])}/><small>JPG · PNG · WEBP / 최대 4MB</small>{layout.image.url && <button type="button" className="btn small" onClick={() => setLayout(p => ({ ...p, image: { ...p.image, url: null } }))}>공통 이미지 선택 해제</button>}</> : <small>각 라벨에 해당 물품의 사진이 들어가. 사진이 없으면 비워 둬.</small>}
                    <small>이미지는 원본 비율을 유지하고, 영역 안에 맞춰 표시돼.</small>
                  </div>}
                  {selected === "info" && <div className={styles.extraControls}>
                    <div className={styles.numbers}><label>글자 크기 (pt)<input type="number" min="5" max="12" step="0.1" value={layout.info.fontSize} onChange={e => setLayout(p => ({ ...p, info: { ...p.info, fontSize: Math.max(5, Math.min(12, Number(e.target.value) || 5)) } }))}/></label><label>항목명 너비 (mm)<input type="number" min="8" max="35" step="0.1" value={layout.info.labelWidth} onChange={e => setLayout(p => ({ ...p, info: { ...p.info, labelWidth: Math.max(8, Math.min(35, Number(e.target.value) || 8)) } }))}/></label></div>
                    <label className={styles.check}><input type="checkbox" checked={layout.info.borders} onChange={e => setLayout(p => ({ ...p, info: { ...p.info, borders: e.target.checked } }))}/> 표 테두리 표시</label>
                    <div className={styles.orderTitle}>정보 순서</div><div className={styles.orderList}>{layout.info.order.map((key, i) => <div key={key}><span>{FIELD_NAMES[key]}</span><button type="button" disabled={i === 0} aria-label={`${FIELD_NAMES[key]} 위로`} onClick={() => shiftField(i, -1)}><ArrowUp size={13}/></button><button type="button" disabled={i === 6} aria-label={`${FIELD_NAMES[key]} 아래로`} onClick={() => shiftField(i, 1)}><ArrowDown size={13}/></button></div>)}</div>
                    <small>7개 항목이 모두 표시돼. 값은 물품관리에서 수정하고, 빈 값은 -로 출력돼.</small>
                  </div>}
                </fieldset>
                <div className={styles.resetActions}><button className="btn small" disabled={busy} onClick={() => { const next = defaultLayout(); next.image.source = layout.image.source; next.image.url = layout.image.url; next.image.enabled = layout.image.enabled; setLayout(next); setNotice("기본 배치로 변경했습니다. 저장하면 적용됩니다."); }}><RotateCcw size={13}/> 기본 배치</button><button className="btn small" disabled={busy || !dirty} onClick={() => { if (saved) setLayout(saved.layout); setNotice(""); }}>변경 취소</button></div>
              </aside>
            </div>
            <div className={styles.printBar}><div><strong>저장한 레이아웃으로 출력</strong><span>출력시 여백설정 - 여백 없음 · A4 · 100% · 머리글·바닥글 끔</span>{dirty && <small>수정 중인 배치는 저장 후 인쇄할 수 있어.</small>}</div><div className="actions"><button className="btn" disabled={printDisabled} onClick={() => print(true)}>인쇄 미리보기</button><button className="btn primary" disabled={printDisabled} onClick={() => print(false)}><Printer size={15}/> 전체 라벨 인쇄 / PDF</button><a className="btn" href={`/api/qr-batch?org=${org}&mode=zip`}><Download size={15}/> 전체 QR ZIP</a></div></div>
          </section>
          {notice && <div className={styles.notice} role="status">{notice}</div>}
          <section className={`card ${styles.itemList}`}><div className={styles.listBar}><h3>물품별 QR <small>{items.length}개</small></h3><input className="input" aria-label="QR 물품 검색" placeholder="관리번호 또는 품명 검색" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}/></div>
            {!visible.length ? <div className="empty">표시할 물품이 없습니다.</div> : visible.map(item => <div className={styles.itemRow} key={item.public_id}>
              <img src={`/api/qr/${item.public_id}`} alt={`${item.management_no} QR`} width={60} height={60} loading="lazy"/>
              <div className={styles.itemName}><strong>{item.item_name}</strong><span>{item.management_no} · {item.storage_location || "위치 미입력"}</span></div>
              <div className="actions"><button className="btn small" onClick={() => setItemId(item.public_id)}>편집기에서 보기</button><button className="btn small" disabled={printDisabled} onClick={() => print(false, item.public_id)}><Printer size={13}/> 인쇄</button><a className="btn small" href={`/api/qr/${item.public_id}`} download={`${org}-${item.management_no}-QR.png`}><Download size={13}/> QR</a><button className="btn small" onClick={() => copyUrl(item.public_id)}><Copy size={13}/> URL 복사</button><a className="btn small" href={`/item/${item.public_id}`} target="_blank" rel="noreferrer"><ExternalLink size={13}/> 공개보기</a><Link className="btn small" onClick={leave} href={`${base}/items?edit=${item.public_id}`}><Pencil size={13}/> 수정 및 상세</Link></div>
            </div>)}
            <div className={styles.pagination}><button className="btn small" disabled={page === 0} onClick={() => setPage(p => p - 1)}>이전</button><span>{Math.min(page, pageCount - 1) + 1} / {pageCount}</span><button className="btn small" disabled={page >= pageCount - 1} onClick={() => setPage(p => p + 1)}>다음</button></div>
          </section>
        </>}
      </div>
    </main>
  </div>;
}
