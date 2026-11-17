"use client";
import { useEffect, useRef, useState } from "react";
import { Download, X } from "lucide-react";
import type { Organization } from "@/lib/types";
import { StoredZip, csvText, imageExtension, safePhotoName } from "@/lib/photo-archive";

type Photo = { id: string; organization: Organization; management_no: string; item_name: string; photo_url: string };
type Manifest = { items: Photo[]; total: number; withoutPhoto: number };
type DiskWriter = { write(data: Uint8Array): Promise<void>; close(): Promise<void>; abort(): Promise<void> };
type PickerWindow = Window & { showSaveFilePicker?: (options: unknown) => Promise<{ createWritable(): Promise<DiskWriter> }> };
const MEMORY_PART_BYTES = 64 * 1024 * 1024;
const MAX_PHOTO_BYTES = 20 * 1024 * 1024;

async function readPhoto(photo: Photo, signal: AbortSignal): Promise<{ bytes: Uint8Array; extension: string }> {
  const url = new URL(photo.photo_url);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("지원하지 않는 사진 주소");
  // No server-side arbitrary-URL fetch: avoids SSRF and a long-running ZIP function.
  const response = await fetch(url.href, { mode: "cors", credentials: "omit", referrerPolicy: "no-referrer", signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]) });
  if (!response.ok || !response.body) throw new Error(`사진 응답 오류 (${response.status})`);
  const extension = imageExtension(response.headers.get("Content-Type") || "");
  if (!extension) { await response.body.cancel(); throw new Error("지원하지 않는 이미지 형식"); }
  if (Number(response.headers.get("Content-Length")) > MAX_PHOTO_BYTES) { await response.body.cancel(); throw new Error("사진 1장 용량이 20MB를 초과함"); }
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_PHOTO_BYTES) throw new Error("사진 1장 용량이 20MB를 초과함");
      chunks.push(value);
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
  if (!size) throw new Error("빈 이미지 파일");
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return { bytes, extension };
}

export default function PhotoArchiveButton({ org }: { org: Organization }) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<string>(org);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState(0);
  const [part, setPart] = useState<{ url: string; name: string } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const pendingPart = useRef<(() => void) | null>(null);
  const partUrl = useRef<string | null>(null);
  const runningRef = useRef(false);

  useEffect(() => { setScope(org); }, [org]);
  useEffect(() => {
    if (!open || running) return;
    const controller = new AbortController(); setManifest(null); setLoading(true); setMessage("");
    fetch(`/api/items/photo-manifest?org=${scope}`, { cache: "no-store", signal: controller.signal }).then(async response => {
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "사진 목록을 불러오지 못했습니다.");
      if (!controller.signal.aborted) setManifest(data);
    }).catch(error => { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "목록 조회 실패"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [open, scope]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (runningRef.current) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => { window.removeEventListener("beforeunload", warn); abort.current?.abort(); pendingPart.current?.(); if (partUrl.current) URL.revokeObjectURL(partUrl.current); };
  }, []);

  function cancel() { abort.current?.abort(); pendingPart.current?.(); }
  function close() { if (running) { cancel(); return; } setOpen(false); }
  function savePart() {
    if (!part) return;
    const a = document.createElement("a"); a.href = part.url; a.download = part.name; document.body.appendChild(a); a.click(); a.remove();
    const url = part.url; setTimeout(() => URL.revokeObjectURL(url), 30000);
    partUrl.current = null; setPart(null); pendingPart.current?.();
  }
  async function start() {
    if (runningRef.current || !manifest?.items.length) return;
    runningRef.current = true; setRunning(true); setProgress(0); setMessage("");
    const controller = new AbortController(); abort.current = controller;
    let disk: DiskWriter | null = null; let partNumber = 1; let savedParts = 0;
    const prefix = `${scope === "ALL" ? "CBGC_CBCKL" : scope}_물품사진_${new Date().toISOString().slice(0, 10)}`;
    const failures: unknown[][] = [["대장", "관리번호", "품명", "실패사유"]];
    let contents: Uint8Array[] = []; let partRows: unknown[][] = [["대장", "관리번호", "품명", "파일명"]];
    let success = 0; let attempted = 0;
    try {
      const picker = (window as PickerWindow).showSaveFilePicker;
      // Must be the first async call in the click handler (transient user activation).
      if (picker) {
        const handle = await picker.call(window, { suggestedName: `${prefix}.zip`, types: [{ description: "ZIP 압축파일", accept: { "application/zip": [".zip"] } }] });
        disk = await handle.createWritable();
      }
      const makeZip = () => new StoredZip({ write: async chunk => {
        controller.signal.throwIfAborted();
        if (disk) await disk.write(chunk); else contents.push(chunk);
      } });
      let zip = makeZip();
      async function finishPart(last: boolean) {
        await zip.add("목록.csv", new TextEncoder().encode(csvText(partRows)));
        if (last) {
          await zip.add("다운로드_실패목록.csv", new TextEncoder().encode(csvText(failures)));
          await zip.add("안내.txt", new TextEncoder().encode(`등록된 물품사진 백업\n사진 없는 물품: ${manifest!.withoutPhoto}개\n성공: ${success}개 / 실패: ${failures.length - 1}개\n파일은 저장된 이미지 그대로이며 재압축하지 않습니다. 실패목록과 수량을 확인하세요.\n외부 이미지의 CORS 제한, 삭제된 파일, 20MB 초과 파일은 실패목록에 기록됩니다.\n이 백업은 물품사진만 포함하며 QR 코드와 공통 라벨 이미지는 포함하지 않습니다.\n`));
        }
        await zip.finish();
        if (!disk) {
          const blob = new Blob(contents as BlobPart[], { type: "application/zip" }); contents = [];
          const url = URL.createObjectURL(blob); partUrl.current = url;
          setPart({ url, name: `${prefix}_${String(partNumber).padStart(3, "0")}.zip` });
          setMessage(`${partNumber}번째 ZIP 준비 완료. 아래 저장 버튼을 누르면 ${last ? "완료됩니다" : "나머지 사진을 계속 처리합니다"}.`);
          await new Promise<void>(resolve => { pendingPart.current = resolve; if (controller.signal.aborted) resolve(); });
          pendingPart.current = null; controller.signal.throwIfAborted(); savedParts++; partNumber++;
          zip = makeZip(); partRows = [["대장", "관리번호", "품명", "파일명"]];
        }
      }
      for (const photo of manifest.items) {
        controller.signal.throwIfAborted();
        let downloaded: Awaited<ReturnType<typeof readPhoto>>;
        try { downloaded = await readPhoto(photo, controller.signal); }
        catch (error) {
          controller.signal.throwIfAborted();
          failures.push([photo.organization, photo.management_no, photo.item_name, error instanceof TypeError ? "사진 연결 실패 또는 외부 사이트 CORS 제한" : error instanceof Error ? error.message : "다운로드 실패"]);
          attempted++; setProgress(attempted); continue;
        }
        if (!disk && zip.bytesWritten + downloaded.bytes.length > MEMORY_PART_BYTES && partRows.length > 1) await finishPart(false);
        const name = `${photo.organization}/${String(attempted + 1).padStart(4, "0")}_${safePhotoName(photo.management_no)}_${safePhotoName(photo.item_name)}.${downloaded.extension}`;
        // A disk/ZIP write error is fatal; never hide it as a per-image fetch failure.
        await zip.add(name, downloaded.bytes);
        partRows.push([photo.organization, photo.management_no, photo.item_name, name]);
        success++; attempted++; setProgress(attempted);
        setMessage(`${attempted}/${manifest.items.length}개 처리 · 성공 ${success} · 실패 ${failures.length - 1}`);
      }
      await finishPart(true);
      if (disk) { await disk.close(); disk = null; savedParts = 1; }
      setMessage(`다운로드 완료: 사진 ${success}개, 실패 ${failures.length - 1}개, 사진 미등록 ${manifest.withoutPhoto}개. ZIP ${savedParts}개를 저장했어.${failures.length > 1 ? " 실패목록 CSV를 확인해 줘." : ""}`);
    } catch (error) {
      if (disk) await disk.abort().catch(() => {});
      setMessage(controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError") ? `취소했어. 이미 저장한 ZIP ${savedParts}개는 남아 있어.` : `중단됨: ${error instanceof Error ? error.message : "파일 저장 실패"}. 저장 공간과 브라우저 권한을 확인해 줘.`);
    } finally {
      if (partUrl.current) URL.revokeObjectURL(partUrl.current);
      partUrl.current = null; pendingPart.current = null; setPart(null);
      runningRef.current = false; setRunning(false); abort.current = null;
    }
  }
  return <>
    <button className="btn" onClick={() => setOpen(true)}><Download size={15}/> 전체 이미지 다운로드</button>
    {open && <div className="modal-backdrop"><div className="modal" role="dialog" aria-modal="true" aria-label="전체 이미지 다운로드" style={{ maxWidth: 600 }}>
      <div className="modal-head"><strong>전체 물품사진 다운로드</strong><button className="btn small" onClick={close}><X size={14}/>{running ? "취소" : "닫기"}</button></div>
      <div className="modal-body">
        <label htmlFor="photo-archive-scope">다운로드할 물품대장</label>
        <select id="photo-archive-scope" className="select" disabled={running} value={scope} onChange={event => setScope(event.target.value)}><option value="CBGC">CBGC 전체</option><option value="CBCKL">CBCKL 전체</option><option value="ALL">CBGC + CBCKL 전체</option></select>
        <p style={{fontSize:13}}>검색·정렬·내용연수 필터와 관계없이 선택한 대장의 등록된 물품사진을 모두 가져와. 파일명에는 관리번호와 품명이 들어가.</p>
        <p style={{fontSize:12,color:"var(--muted)"}}>PC에서 직접 파일 저장을 지원하면 ZIP 하나로 저장해. 미지원 브라우저는 약 64MB 단위 ZIP으로 나눠 저장하며 각 ZIP의 저장 버튼을 눌러야 해. 완료 전에는 이 페이지를 닫지 마.</p>
        {loading ? <p>사진 목록 불러오는 중...</p> : manifest && <p><strong>사진 {manifest.items.length}개</strong> / 전체 물품 {manifest.total}개 / 사진 없음 {manifest.withoutPhoto}개</p>}
        {running && <progress max={manifest?.items.length || 1} value={progress} style={{width:"100%"}}/>}
        <p role="status" style={{fontSize:13,whiteSpace:"pre-wrap"}}>{message}</p>
        {part && <button className="btn primary" onClick={savePart}>이 ZIP 저장 후 계속</button>}
      </div>
      <div className="modal-foot"><button className="btn" onClick={close}>{running ? "다운로드 취소" : "닫기"}</button><button className="btn primary" disabled={running || loading || !manifest?.items.length} onClick={start}><Download size={15}/>{running ? "처리 중..." : "ZIP 저장 시작"}</button></div>
    </div></div>}
  </>;
}
