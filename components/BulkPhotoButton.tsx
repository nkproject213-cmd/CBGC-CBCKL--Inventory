"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import type { InventoryItem, Organization } from "@/lib/types";
import { compressItemPhoto } from "@/lib/item-photo";
import { isPhotoUrl } from "@/lib/flexible-fields";
import { MAX_BULK_PHOTO_ITEMS } from "@/lib/shared-photo";
import styles from "./BulkPhotoButton.module.css";

type Target = Pick<InventoryItem, "id" | "management_no" | "item_name" | "photo_url">;
type Props = {
  org: Organization;
  selectedItems: Target[];
  disabled: boolean;
  onSaved: () => Promise<void>;
};

export default function BulkPhotoButton({ org, selectedItems, disabled, onSaved }: Props) {
  const [targets, setTargets] = useState<Target[] | null>(null);
  const [message, setMessage] = useState("");

  function open() {
    setMessage("");
    setTargets(selectedItems.map(item => ({ ...item })));
  }

  async function applied(total: number) {
    setMessage(`${total}개 물품에 사진 적용 완료`);
    await onSaved();
    setTargets(null);
  }

  return <>
    <button className="btn" disabled={disabled || selectedItems.length === 0} onClick={open}>
      <ImagePlus size={15}/> 사진 일괄 적용 ({selectedItems.length})
    </button>
    {message && <span className={styles.result} role="status">{message}</span>}
    {targets && <BulkPhotoModal org={org} targets={targets} onClose={() => setTargets(null)} onApplied={applied}/>}
  </>;
}

function BulkPhotoModal({ org, targets, onClose, onApplied }: {
  org: Organization;
  targets: Target[];
  onClose: () => void;
  onApplied: (total: number) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const uploading = useRef(false);
  const uploadedUrl = useRef<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [previewReady, setPreviewReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const replacing = targets.filter(item => isPhotoUrl(item.photo_url)).length;

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  function chooseFile(nextFile?: File) {
    if (!nextFile || uploading.current) return;
    setError("");
    uploadedUrl.current = null;
    setPreviewReady(false);
    setPreview("");
    if (!nextFile.size || !["image/jpeg", "image/png", "image/webp"].includes(nextFile.type)) {
      setFile(null);
      setError("JPG, PNG, WEBP 사진을 선택해 주세요.");
      return;
    }
    setFile(nextFile);
    setPreview(URL.createObjectURL(nextFile));
  }

  async function apply() {
    if (!file || !previewReady || uploading.current) return;
    if (targets.length > MAX_BULK_PHOTO_ITEMS) {
      setError(`사진은 한 번에 ${MAX_BULK_PHOTO_ITEMS.toLocaleString("ko-KR")}개 물품까지 적용할 수 있습니다. 물품을 다시 선택해 주세요.`);
      return;
    }
    uploading.current = true;
    setBusy(true);
    setError("");
    try {
      if (!uploadedUrl.current) {
        setProgress("사진 압축 및 업로드 중...");
        const form = new FormData();
        form.append("file", await compressItemPhoto(file));
        form.append("purpose", "bulk-photo");
        const response = await fetch("/api/upload", { method: "POST", body: form });
        if (response.status === 401) throw new Error("로그인 시간이 만료됐습니다. 다시 로그인해 주세요.");
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "사진 업로드에 실패했습니다.");
        if (!isPhotoUrl(result.url)) throw new Error("업로드한 사진 주소를 확인할 수 없습니다. 다시 시도해 주세요.");
        uploadedUrl.current = result.url;
      }
      setProgress(`${targets.length}개 물품에 사진 적용 중...`);
      const response = await fetch("/api/items/bulk-photo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organization: org, ids: targets.map(item => item.id), photo_url: uploadedUrl.current }),
      });
      if (response.status === 401) throw new Error("로그인 시간이 만료됐습니다. 다시 로그인해 주세요.");
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "사진 일괄 적용에 실패했습니다. 다시 시도해 주세요.");
      await onApplied(result.total);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "사진 일괄 적용에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      uploading.current = false;
      setBusy(false);
      setProgress("");
    }
  }

  function close() {
    if (!uploading.current) onClose();
  }

  return <dialog ref={dialog} className={`modal ${styles.dialog}`} aria-labelledby="bulk-photo-title"
    onCancel={event => { event.preventDefault(); close(); }}>
    <div className="modal-head">
      <strong id="bulk-photo-title">사진 일괄 적용</strong>
      <button className="btn small" disabled={busy} onClick={close} aria-label="사진 일괄 적용 닫기"><X size={14}/> 닫기</button>
    </div>
    <div className={`modal-body ${styles.body}`}>
      <div>
        <p className={styles.summary}>{org} 선택 물품 {targets.length}개에 같은 사진을 적용합니다.</p>
        {replacing > 0 && <p className={styles.notice}>기존 사진이 있는 {replacing}개 물품은 선택한 사진으로 교체됩니다.</p>}
      </div>
      <div className={styles.targets} tabIndex={0} aria-label="사진을 적용할 관리번호 목록">
        <table>
          <thead><tr><th>관리번호</th><th>품명</th></tr></thead>
          <tbody>{targets.map(item => <tr key={item.id}><td>{item.management_no}</td><td>{item.item_name || "-"}</td></tr>)}</tbody>
        </table>
      </div>
      <div className="field">
        <label htmlFor="bulk-photo-file">적용할 사진</label>
        <input id="bulk-photo-file" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy}
          onChange={event => { chooseFile(event.target.files?.[0]); event.target.value = ""; }}/>
        <small>JPG, PNG, WEBP · 업로드 전 250KB 이하로 자동 압축</small>
      </div>
      {preview && <div className={styles.preview}>
        <Image key={preview} src={preview} alt="일괄 적용할 사진 미리보기" width={560} height={240} unoptimized
          onLoad={() => setPreviewReady(true)}
          onError={() => { setPreviewReady(false); setError("사진을 읽을 수 없습니다. 다른 파일을 선택해 주세요."); }}/>
        <p>{file?.name}</p>
      </div>}
      {progress && <p className={styles.progress} role="status">{progress}</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
    </div>
    <div className="modal-foot">
      <button className="btn" disabled={busy} onClick={close}>취소</button>
      <button className="btn primary" disabled={busy || !file || !previewReady} onClick={apply}>
        {busy ? "적용 중..." : `${targets.length}개 물품에 사진 적용`}
      </button>
    </div>
  </dialog>;
}
