/** Shared by the editor and print renderer. Coordinates are physical millimetres. */
export const LABEL_WIDTH = 62.7;
export const LABEL_HEIGHT = 30.1;
export const BLOCK_KEYS = ["qr", "image", "info"] as const;
export type BlockKey = typeof BLOCK_KEYS[number];
export type Box = { x: number; y: number; width: number; height: number };
export const FIELD_KEYS = ["item_name", "management_no", "specification", "acquired_date", "storage_location", "manager_main", "manager_sub"] as const;
export type FieldKey = typeof FIELD_KEYS[number];
export const FIELD_NAMES: Record<FieldKey, string> = {
  item_name: "품명", management_no: "관리번호", specification: "규격", acquired_date: "취득일자",
  storage_location: "위치", manager_main: "관리책임자(정)", manager_sub: "관리책임자(부)",
};
export type QrLayout = {
  version: 1;
  qr: Box;
  image: Box & { enabled: boolean; source: "custom" | "item"; url: string | null };
  info: Box & { fontSize: number; labelWidth: number; borders: boolean; order: FieldKey[] };
};
export type LabelData = { public_id: string; photo_url?: string | null } & Partial<Record<FieldKey, string | null>>;
export function defaultLayout(): QrLayout {
  return {
    version: 1,
    qr: { x: 1, y: 1, width: 21, height: 21 },
    image: { x: 1, y: 23, width: 21, height: 6.1, enabled: true, source: "item", url: null },
    info: { x: 23, y: 1, width: 38.7, height: 28.1, fontSize: 6.2, labelWidth: 13.5, borders: true, order: [...FIELD_KEYS] },
  };
}
export function safeImageUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const u = new URL(value.trim());
    return u.protocol === "https:" && !u.username && !u.password ? u.href : null;
  } catch { return null; }
}
export function layoutIssues(layout: QrLayout): string[] {
  const issues: string[] = [];
  const names = { qr: "QR", image: "이미지", info: "정보" };
  for (const key of BLOCK_KEYS) {
    const b = layout[key];
    if (key === "image" && !layout.image.enabled) continue;
    if (![b.x, b.y, b.width, b.height].every(Number.isFinite) || b.x < 0.5 || b.y < 0.5 || b.width < 3 || b.height < 3 || b.x + b.width > LABEL_WIDTH - 0.49 || b.y + b.height > LABEL_HEIGHT - 0.49) {
      issues.push(`${names[key]} 영역이 라벨의 안전 여백을 벗어났어.`);
    }
  }
  if (layout.qr.width < 16 || Math.abs(layout.qr.width - layout.qr.height) > 0.01) issues.push("QR은 16mm 이상의 정사각형이어야 해.");
  if (layout.info.width < 24 || layout.info.height < 14) issues.push("정보 영역은 최소 24×14mm가 필요해.");
  if (layout.info.labelWidth < 8 || layout.info.labelWidth > layout.info.width - 8) issues.push("정보의 항목명 너비와 값 너비를 각각 8mm 이상 확보해 줘.");
  for (let i = 0; i < BLOCK_KEYS.length; i++) for (let j = i + 1; j < BLOCK_KEYS.length; j++) {
    const ka = BLOCK_KEYS[i], kb = BLOCK_KEYS[j];
    if (!layout.image.enabled && (ka === "image" || kb === "image")) continue;
    const a = layout[ka], b = layout[kb];
    if (Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 0.05 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 0.05) {
      issues.push(`${names[ka]}와 ${names[kb]} 영역이 겹쳐 있어.`);
    }
  }
  return issues;
}
/** Validate untrusted JSON before it can become inline CSS or HTML. */
export function parseLayout(input: unknown): QrLayout {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("레이아웃 형식이 올바르지 않습니다.");
  const v = input as Record<string, unknown>;
  if (v.version !== 1) throw new Error("지원하지 않는 레이아웃 버전입니다.");
  function obj(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("영역 설정을 확인해 주세요.");
    return value as Record<string, unknown>;
  }
  function num(o: Record<string, unknown>, key: string, min: number, max: number): number {
    const n = o[key];
    if (typeof n !== "number" || !Number.isFinite(n) || n < min || n > max) throw new Error("위치·크기·글자 크기 설정을 확인해 주세요.");
    return Math.round(n * 100) / 100;
  }
  function box(o: Record<string, unknown>): Box {
    return { x: num(o, "x", 0.5, 62.2), y: num(o, "y", 0.5, 29.6), width: num(o, "width", 3, 61.7), height: num(o, "height", 3, 29.1) };
  }
  const q = obj(v.qr), m = obj(v.image), t = obj(v.info);
  if (typeof m.enabled !== "boolean" || (m.source !== "custom" && m.source !== "item") || typeof t.borders !== "boolean") throw new Error("이미지·표 설정을 확인해 주세요.");
  const url = safeImageUrl(m.url);
  if (m.url != null && m.url !== "" && (!url || typeof m.url !== "string" || m.url.length > 2048)) throw new Error("유효한 HTTPS 이미지 주소가 필요합니다.");
  const order = t.order;
  if (!Array.isArray(order) || order.length !== FIELD_KEYS.length || new Set(order).size !== FIELD_KEYS.length || !order.every(k => typeof k === "string" && FIELD_KEYS.includes(k as FieldKey))) throw new Error("정보에는 지정한 7개 항목이 각각 한 번씩 있어야 합니다.");
  const result: QrLayout = {
    version: 1, qr: box(q), image: { ...box(m), enabled: m.enabled, source: m.source, url },
    info: { ...box(t), fontSize: num(t, "fontSize", 5, 12), labelWidth: num(t, "labelWidth", 8, 35), borders: t.borders, order: order as FieldKey[] },
  };
  const issues = layoutIssues(result);
  if (issues.length) throw new Error(issues.join(" "));
  return result;
}
export function boundBox(key: BlockKey, value: Box): Box {
  const round = (n: number) => Math.round(n * 10) / 10;
  const minW = key === "qr" ? 16 : key === "info" ? 24 : 3;
  const minH = key === "qr" ? 16 : key === "info" ? 14 : 3;
  let width = Math.max(minW, Math.min(LABEL_WIDTH - 1, value.width));
  let height = Math.max(minH, Math.min(LABEL_HEIGHT - 1, value.height));
  if (key === "qr") width = height = Math.max(16, Math.min(29.1, width));
  return { x: round(Math.max(0.5, Math.min(LABEL_WIDTH - 0.5 - width, value.x))), y: round(Math.max(0.5, Math.min(LABEL_HEIGHT - 0.5 - height, value.y))), width: round(width), height: round(height) };
}
export function escapeLayoutText(value: unknown): string {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
export function fieldValue(item: LabelData, key: FieldKey): string {
  const value: unknown = item[key];
  if (value == null || value === "") return "-";
  if (key === "acquired_date") {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? "-" : value.toISOString().slice(0, 10);
    const text = String(value).trim();
    return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : text || "-";
  }
  return String(value).trim() || "-";
}
export function imageFor(item: LabelData, layout: QrLayout): string | null {
  return layout.image.enabled ? safeImageUrl(layout.image.source === "custom" ? layout.image.url : item.photo_url) : null;
}
export function informationHtml(item: LabelData, layout: QrLayout): string {
  const { info } = layout;
  return `<div class="ql-table ${info.borders ? "ql-bordered" : ""}" data-font="${info.fontSize}" style="--ql-key:${info.labelWidth}mm">${info.order.map(key => `<div class="ql-row"><b class="ql-key">${FIELD_NAMES[key]}</b><span class="ql-value">${escapeLayoutText(fieldValue(item, key))}</span></div>`).join("")}</div>`;
}
export const LABEL_CSS = `
.ql-label{position:relative;width:62.7mm;height:30.1mm;background:#fff;color:#111;overflow:hidden;font-family:"Malgun Gothic","Noto Sans CJK KR","Noto Sans KR","Apple SD Gothic Neo",Arial,sans-serif;box-sizing:border-box}
.ql-label *{box-sizing:border-box}.ql-block{position:absolute;min-width:0;min-height:0;overflow:hidden}
.ql-qr{display:flex;align-items:center;justify-content:center;background:#fff}.ql-qr svg,.ql-qr img{display:block;width:100%;height:100%;object-fit:contain}
.ql-image{display:flex;align-items:center;justify-content:center}.ql-image img{width:100%;height:100%;object-fit:contain;display:block}
.ql-table{height:100%;display:grid;grid-template-rows:repeat(7,minmax(0,1fr));min-width:0;min-height:0}
.ql-row{display:grid;grid-template-columns:var(--ql-key) minmax(0,1fr);align-items:stretch;min-width:0;min-height:0}
.ql-key,.ql-value{margin:0;display:flex;align-items:center;min-width:0;min-height:0;padding:.2mm .35mm;line-height:1.08;white-space:normal;overflow-wrap:anywhere;word-break:normal}
.ql-key{font-weight:700;white-space:nowrap}.ql-bordered{border:.15mm solid #222}.ql-bordered .ql-row:not(:last-child){border-bottom:.15mm solid #222}.ql-bordered .ql-key{border-right:.15mm solid #222}
`;
/** Intentionally self-contained: the exact same fitter is embedded in printed HTML. */
export function fitInformation(root: ParentNode): string[] {
  const overflow: string[] = [];
  root.querySelectorAll<HTMLElement>(".ql-table").forEach(table => {
    const initial = Number(table.dataset.font) * 96 / 72;
    table.querySelectorAll<HTMLElement>(".ql-key,.ql-value").forEach(el => {
      let size = el.classList.contains("ql-key") ? Math.min(initial, 6.2 * 96 / 72) : initial;
      const floor = 4.5 * 96 / 72;
      el.style.fontSize = size + "px";
      const fits = () => el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1;
      while (!fits() && size > floor) { size = Math.max(floor, size - .2); el.style.fontSize = size + "px"; }
      if (!fits()) {
        const label = el.closest<HTMLElement>(".ql-label");
        const id = label?.dataset.managementNo || "미리보기";
        if (!overflow.includes(id)) overflow.push(id);
      }
    });
  });
  return overflow;
}
export function renderLayoutDocument(org: string, items: LabelData[], qrSvgs: ReadonlyMap<string, string>, input: QrLayout): string {
  const layout = parseLayout(input);
  const style = (b: Box) => `left:${b.x}mm;top:${b.y}mm;width:${b.width}mm;height:${b.height}mm`;
  const labels = items.map(item => {
    const svg = qrSvgs.get(item.public_id);
    if (!svg) throw new Error("QR을 생성하지 못했습니다.");
    const image = imageFor(item, layout);
    return `<article class="ql-label" data-management-no="${escapeLayoutText(item.management_no)}"><div class="ql-block ql-qr" style="${style(layout.qr)}">${svg}</div>${image ? `<div class="ql-block ql-image" style="${style(layout.image)}"><img src="${escapeLayoutText(image)}" alt="" referrerpolicy="no-referrer"></div>` : ""}<div class="ql-block ql-info" style="${style(layout.info)}">${informationHtml(item, layout)}</div></article>`;
  });
  const pages: string[] = [];
  for (let i = 0; i < labels.length; i += 27) pages.push(`<section class="sheet">${labels.slice(i, i + 27).join("")}</section>`);
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeLayoutText(org)} QR 라벨</title><style>
*{box-sizing:border-box}@page{size:A4 portrait;margin:0}html,body{margin:0;padding:0}body{font-family:Arial,sans-serif;background:#eef1f4}
${LABEL_CSS}
.controls{position:sticky;top:0;z-index:20;background:white;padding:12px 18px;display:flex;gap:12px;flex-wrap:wrap;align-items:center;border-bottom:1px solid #ddd;font-size:12px}.controls button{padding:10px 16px;border:0;border-radius:8px;background:#111;color:white;cursor:pointer}.controls button:disabled{opacity:.4;cursor:not-allowed}#print-status{width:100%;line-height:1.5}.error{color:#b42318}
.sheet{width:210mm;height:297mm;padding:11mm 0 0 8mm;display:grid;grid-template-columns:repeat(3,62.7mm);grid-template-rows:repeat(9,30.1mm);column-gap:2.5mm;row-gap:0;align-content:start;break-after:page;page-break-after:always;margin:18px auto;background:white}.sheet:last-of-type{break-after:auto;page-break-after:auto}.ql-label{outline:1px dashed #ddd}.empty{padding:40px}
@media print{body{background:white}.controls{display:none}.sheet{margin:0;box-shadow:none}.ql-label{outline:0}}
</style></head><body><div class="controls"><button id="print-button" disabled>인쇄 / PDF 저장</button><span>폼텍 3104 · 27칸(3×9) · A4 · 배율 100% · 여백 없음 · 머리글·바닥글 끔 · 총 ${items.length}개</span><span id="print-status" role="status">글자와 이미지를 확인하는 중입니다.</span></div>${pages.join("") || '<div class="empty">등록된 물품이 없습니다.</div>'}<script>
window.addEventListener("load",async()=>{
 const button=document.getElementById("print-button"),status=document.getElementById("print-status");
 if(document.fonts) await document.fonts.ready;
 const overflow=(${fitInformation.toString()})(document);
 const bad=Array.from(document.images).filter(i=>!i.complete||i.naturalWidth===0);
 if(overflow.length||bad.length){status.className="error";status.textContent=(overflow.length?"내용이 넘치는 물품: "+overflow.slice(0,10).join(", ")+". 정보 영역을 넓히거나 글자 크기를 조절해 주세요. ":"")+(bad.length?"불러오지 못한 이미지 "+bad.length+"개. 이미지 설정을 확인해 주세요.":"");return;}
 button.disabled=${items.length === 0 ? "true" : "false"};status.textContent="저장한 레이아웃으로 출력됩니다. 빈 정보는 -로 표시됩니다.";
 if(!button.disabled&&new URLSearchParams(location.search).get("autoprint")!=="0")setTimeout(()=>window.print(),150);
});document.getElementById("print-button").addEventListener("click",()=>window.print());
</script></body></html>`;
}
