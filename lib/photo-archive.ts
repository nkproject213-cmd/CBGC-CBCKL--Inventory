/** A bounded-memory, store-only ZIP writer. Uploaded photos are already compressed. */
export type ArchiveSink = { write(chunk: Uint8Array): Promise<void> };
const encoder = new TextEncoder();
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) { let c = i; for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[i] = c; }
export function crc32(bytes: Uint8Array): number { let c = 0xffffffff; for (const b of bytes) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
export class StoredZip {
  private position = 0;
  private central: Uint8Array[] = [];
  private count = 0;
  private closed = false;
  constructor(private sink: ArchiveSink) {}
  get bytesWritten() { return this.position; }
  private async emit(bytes: Uint8Array) { await this.sink.write(bytes); this.position += bytes.length; }
  async add(name: string, bytes: Uint8Array) {
    if (this.closed) throw new Error("이미 완료된 ZIP입니다.");
    const path = encoder.encode(name);
    if (!name || name.startsWith("/") || name.includes("\\") || name.split("/").includes("..") || path.length > 65535) throw new Error("잘못된 파일명입니다.");
    if (this.position + bytes.length + path.length + 1024 > 0xf0000000 || this.count >= 60000) throw new Error("ZIP 크기가 너무 큽니다. 대장별로 나눠 다운로드해 주세요.");
    const header = new Uint8Array(30 + path.length); const h = new DataView(header.buffer);
    const now = new Date(); const time = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
    const date = ((Math.max(1980, Math.min(2107, now.getFullYear())) - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const crc = crc32(bytes);
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x800, true);
    h.setUint16(10, time, true); h.setUint16(12, date, true); h.setUint32(14, crc, true);
    h.setUint32(18, bytes.length, true); h.setUint32(22, bytes.length, true); h.setUint16(26, path.length, true); header.set(path, 30);
    const central = new Uint8Array(46 + path.length); const c = new DataView(central.buffer);
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x800, true);
    c.setUint16(12, time, true); c.setUint16(14, date, true); c.setUint32(16, crc, true);
    c.setUint32(20, bytes.length, true); c.setUint32(24, bytes.length, true); c.setUint16(28, path.length, true);
    c.setUint32(42, this.position, true); central.set(path, 46);
    await this.emit(header); await this.emit(bytes); this.central.push(central); this.count++;
  }
  async finish() {
    if (this.closed) throw new Error("이미 완료된 ZIP입니다.");
    this.closed = true; const offset = this.position;
    for (const entry of this.central) await this.emit(entry);
    const size = this.position - offset; const end = new Uint8Array(22); const v = new DataView(end.buffer);
    v.setUint32(0, 0x06054b50, true); v.setUint16(8, this.count, true); v.setUint16(10, this.count, true);
    v.setUint32(12, size, true); v.setUint32(16, offset, true); await this.emit(end);
  }
}
export function safePhotoName(value: string) {
  return value.normalize("NFC").replace(/[\u0000-\u001f\u007f\\/:*?"<>|]/g, "_").replace(/\s+/g, " ").replace(/[. ]+$/g, "").slice(0, 55) || "미입력";
}
export function imageExtension(contentType: string): string | null {
  return ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif", "image/bmp": "bmp", "image/tiff": "tif", "image/heic": "heic", "image/heif": "heif" } as Record<string, string>)[contentType.toLowerCase().split(";")[0].trim()] || null;
}
export function csvText(rows: unknown[][]): string {
  return "\ufeff" + rows.map(row => row.map(value => {
    let text = String(value ?? ""); if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  }).join(",")).join("\r\n");
}
