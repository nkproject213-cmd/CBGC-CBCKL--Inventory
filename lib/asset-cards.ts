import JSZip from "jszip";
import { StoredZip, type ArchiveSink } from "./photo-archive";
import { ASSET_CARD_TEMPLATE } from "./asset-card-template";
import type { InventoryItem } from "./types";

export type CardItem = Pick<InventoryItem, "organization" | "management_no" | "item_type" | "item_name" | "model_name" | "acquired_date" | "purchase_price" | "useful_life_years" | "manager_main" | "manager_sub" | "storage_location" | "accessories" | "specification" | "classification_no" | "identification_no" | "photo_url">;
export type CardPhoto = { bytes: Uint8Array; width: number; height: number; extension: "jpg" | "png" };
type Template = { sourceSha256: string; sheetXml: string; stylesXml: string; themeXml: string; rowCount: number; photo: { col: number; colOffset: number; row: number; rowOffset: number; width: number; height: number } };
const S = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const P = "http://schemas.openxmlformats.org/package/2006/relationships";
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const textEncoder = new TextEncoder();
let templatePromise: Promise<Template> | undefined;
export function loadCardTemplate(): Promise<Template> {
  return templatePromise ??= JSZip.loadAsync(ASSET_CARD_TEMPLATE, { base64: true, checkCRC32: true }).then(async zip => {
    const entry = zip.file("template.json");
    if (!entry) throw new Error("자산관리카드 양식을 읽을 수 없습니다.");
    return JSON.parse(await entry.async("string")) as Template;
  }).catch(error => { templatePromise = undefined; throw error; });
}
export function cardXml(value: unknown): string {
  return Array.from(String(value ?? "")).map(char => {
    const n = char.codePointAt(0)!;
    return (n < 32 && ![9,10,13].includes(n)) || (n >= 0xd800 && n <= 0xdfff) || n === 0xfffe || n === 0xffff ? "" : char;
  }).join("").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}
export function cardSheetName(managementNo: string): string {
  let number = managementNo.trim().replace(/^(?:CBGC|CBCKL|CB)-/i, "");
  if (/^\d+$/.test(number)) number = number.replace(/^0+(?=\d)/, "");
  const name = `CB-${number}`;
  if (!number || name.length > 31 || /[\x00-\x1f\x7f\[\]:*?\/\\]/.test(name) || name.endsWith("'")) throw new Error(`관리번호 '${managementNo}'로 유효한 CB-번호 시트명을 만들 수 없습니다. 관리번호를 확인해 주세요.`);
  return name;
}
export function validateCardItems(items: CardItem[]): void {
  if (!items.length) throw new Error("출력할 물품이 없습니다.");
  const names = new Map<string,string>();
  for (const item of items) {
    const name = cardSheetName(item.management_no).toLowerCase();
    if (names.has(name)) throw new Error(`시트명 중복: ${names.get(name)} / ${item.management_no}. 같은 CB-번호가 되므로 관리번호를 확인해 주세요.`);
    names.set(name,item.management_no);
    if ((validYears(item) || 0) > 100) throw new Error(`${item.management_no}: 내용연수가 100년을 초과합니다. 한 카드에 모든 연도를 표시하려면 입력값을 확인해 주세요.`);
  }
  if (items.length > 5000) throw new Error("한 번에 5,000개 시트까지 생성할 수 있습니다. 범위를 나눠 주세요.");
}
function validYears(item: CardItem): number | null {
  const value = item.useful_life_years;
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 9999 ? value : null;
}
// Preserve the original 9 x 21 pt depreciation body inside its original footprint.
export const DEPRECIATION_HEIGHT = 189;
export function scheduleRowCount(item: CardItem): number { return validYears(item) || 9; }
export function cardLastRow(item: CardItem): number { return 31 + scheduleRowCount(item); }
export function cardPageCount(_item: CardItem): number { return 1; }
export function scheduleHeights(item: CardItem): number[] {
  const count = scheduleRowCount(item), twips = DEPRECIATION_HEIGHT * 20;
  const whole = Math.floor(twips / count), remainder = twips % count;
  return Array.from({ length: count }, (_, i) => (whole + (i < remainder ? 1 : 0)) / 20);
}
function scheduleFont(item: CardItem): number {
  const height = Math.min(...scheduleHeights(item));
  return Math.max(1, Math.min(11, Math.floor(Math.max(1, (height - 2) / 1.1) * 2) / 2));
}
class CardStyles {
  private fonts: string[];
  private xfs: string[];
  private mapped = new Map<string, number>();
  constructor(private original: string) {
    this.fonts = original.match(/<fonts[^>]*>([\s\S]*?)<\/fonts>/)![1].match(/<font>[\s\S]*?<\/font>/g)!;
    this.xfs = original.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)![1].match(/<xf\b[^>]*\/>|<xf\b[^>]*>[\s\S]*?<\/xf>/g)!;
  }
  style(base: number, size: number): number {
    if (size >= 11) return base;
    const key = `${base}:${size}`, existing = this.mapped.get(key);
    if (existing !== undefined) return existing;
    const originalXf = this.xfs[base], fontId = Number(originalXf.match(/fontId="(\d+)"/)![1]);
    const font = this.fonts[fontId].replace(/<sz val="[^"]*"\/>/, `<sz val="${size}"/>`);
    let newFont = this.fonts.indexOf(font);
    if (newFont < 0) { newFont = this.fonts.length; this.fonts.push(font); }
    let xf = originalXf.replace(/fontId="\d+"/, `fontId="${newFont}"`);
    if (!xf.includes('applyFont=')) xf = xf.replace('<xf ', '<xf applyFont="1" ');
    const id = this.xfs.length; this.xfs.push(xf); this.mapped.set(key, id); return id;
  }
  xml(): string {
    if (!this.mapped.size) return this.original;
    return this.original.replace(/<fonts[^>]*>[\s\S]*?<\/fonts>/, `<fonts count="${this.fonts.length}">${this.fonts.join("")}</fonts>`)
      .replace(/<cellXfs[^>]*>[\s\S]*?<\/cellXfs>/, `<cellXfs count="${this.xfs.length}">${this.xfs.join("")}</cellXfs>`);
  }
}
function validPrice(item: CardItem): number | null {
  const raw: unknown = item.purchase_price;
  const value = typeof raw === "string" && /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : raw;
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
function acquired(item: CardItem): { text: string; year: number | null } {
  const match = String(item.acquired_date || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? { text: `${match[1]}.${Number(match[2])}.${Number(match[3])}.`, year: Number(match[1]) } : { text: "", year: null };
}
function signature(name: string | null): string {
  const value = (name || "").trim();
  if (!value) return "";
  return (/^[가-힣]{2,4}$/.test(value) ? [...value].join(" ") : value) + " (인)";
}
type Cell = { value: string | number | null; formula?: string };
function replaceCell(xml: string, address: string, cell: Cell): string {
  const pattern = new RegExp(`<c\\b(?=[^>]*\\br="${address}")[^>]*?/>|<c\\b(?=[^>]*\\br="${address}")[^>]*?>[\\s\\S]*?<\\/c>`);
  let found = false;
  const result = xml.replace(pattern, raw => {
    found = true;
    const attrs = raw.slice(2,raw.indexOf(">")).replace(/\/$/, "").replace(/\s+t="[^"]*"/g, "");
    if (cell.formula) return `<c${attrs}${typeof cell.value === "number" ? "" : ' t="str"'}><f>${cardXml(cell.formula)}</f><v>${cardXml(cell.value)}</v></c>`;
    if (cell.value == null || cell.value === "") return `<c${attrs}/>`;
    if (typeof cell.value === "number") return `<c${attrs}><v>${cell.value}</v></c>`;
    return `<c${attrs} t="inlineStr"><is><t xml:space="preserve">${cardXml(cell.value)}</t></is></c>`;
  });
  if (!found) throw new Error(`양식 셀을 찾을 수 없습니다: ${address}`);
  return result;
}
export function renderCardSheet(item: CardItem, name: string, template: Template, withPhoto: boolean, styleFor: (base:number,size:number)=>number = base=>base): string {
  const base = template.sheetXml;
  const sourceRows = base.match(/<sheetData>([\s\S]*?)<\/sheetData>/)![1];
  const allRows = sourceRows.match(/<row\b[^>]*>[\s\S]*?<\/row>/g)!;
  let fixedRows = allRows.filter(row => Number(row.match(/\br="(\d+)"/)![1]) <= 31).join("");
  const mergeRefs = [...base.matchAll(/<mergeCell ref="([^"]+)"\/>/g)].map(m=>m[1]);
  const merges = mergeRefs.filter(ref => Number(ref.match(/\d+/)![0]) < 32);
  const date = acquired(item), price = validPrice(item), years = validYears(item);
  const fields: Record<string,string|number|null> = {
    B1:name,C4:signature(item.manager_main),G4:signature(item.manager_sub),
    C6:item.management_no,G6:item.item_type,C7:date.text,G7:item.model_name,
    C8:price,G8:null,C9:item.useful_life_years,G9:item.storage_location,
    C10:item.accessories,G10:item.specification,C11:item.classification_no,G11:item.identification_no,
  };
  for (const [ref,value] of Object.entries(fields)) fixedRows=replaceCell(fixedRows,ref,{value});
  const count = scheduleRowCount(item), heights = scheduleHeights(item), font = scheduleFont(item);
  const body: string[] = [];
  for (let index=0;index<count;index++) {
    const rowNumber=32+index, yearIndex=index+1;
    const sourceNumber=count===9?32+index:index===0?32:index===count-1?40:33;
    const source=allRows.find(row=>row.startsWith(`<row r="${sourceNumber}"`))!;
    let row=source.replace(/\br="([A-Z]*)(\d+)"/g,(_,col)=>`r="${col}${rowNumber}"`)
      .replace(/\bht="[^"]*"/,`ht="${heights[index]}"`);
    if(font<11) row=row.replace(/<c r="([A-Z]+)(\d+)" s="(\d+)"/g,(_,col,n,style)=>`<c r="${col}${n}" s="${col==="B"?style:styleFor(Number(style),font)}"`);
    const put=(col:string,value:string|number|null,formula?:string)=>{row=replaceCell(row,`${col}${rowNumber}`,{value,formula});};
    const annual=years!==null&&price!==null?price/years:null;
    const cumulative=annual===null?null:Math.min(price!,annual*yearIndex);
    put("A",years===null?"":yearIndex,`IF(AND(ISNUMBER($C$9),$C$9>0,${yearIndex}<=$C$9),${yearIndex},"")`);
    if(index===0)put("B",price,'IF(ISNUMBER($C$8),$C$8,"")');
    put("C",annual??"",`IF(AND(ISNUMBER(A${rowNumber}),ISNUMBER($C$8)),$C$8/$C$9,"")`);
    put("D",cumulative??"",`IF(ISNUMBER(C${rowNumber}),MIN($C$8,SUM($C$32:C${rowNumber})),"")`);
    put("E",cumulative===null?"":Math.max(0,price!-cumulative),`IF(ISNUMBER(D${rowNumber}),MAX(0,$C$8-D${rowNumber}),"")`);
    put("G",years!==null&&date.year!==null?date.year+yearIndex-1:"",`IF(AND(ISNUMBER(A${rowNumber}),$C$7<>""),IFERROR(VALUE(LEFT($C$7,4))+A${rowNumber}-1,""),"")`);
    body.push(row);
  }
  if(count>1)merges.push(`B32:B${31+count}`);
  for(let i=0;i<count;i++)merges.push(`E${32+i}:F${32+i}`);
  const xml=base.replace(/<sheetData>[\s\S]*?<\/sheetData>/,`<sheetData>${fixedRows}${body.join("")}</sheetData>`)
    .replace(/<mergeCells[^>]*>[\s\S]*?<\/mergeCells>/,`<mergeCells count="${merges.length}">${merges.map(ref=>`<mergeCell ref="${ref}"/>`).join("")}</mergeCells>`)
    .replace(/<dimension[^>]*\/>/,`<dimension ref="A1:H${cardLastRow(item)}"/>`)
    .replace('tabSelected="1"','tabSelected="0"').replace('view="pageBreakPreview"','view="normal"')
    .replace(/<pageSetup[^>]*\/>/,'<pageSetup paperSize="9" scale="88" fitToWidth="1" fitToHeight="1" orientation="portrait"/>');
  return xml.replace("</worksheet>",`${withPhoto?'<drawing r:id="rId1"/>':""}</worksheet>`);
}
export function renderCardDrawing(photo: CardPhoto, pages: number, template: Template): string {
  if (!(photo.width > 0 && photo.height > 0)) throw new Error("사진 크기를 확인할 수 없습니다.");
  const frame=template.photo, ratio=Math.min(frame.width/photo.width,frame.height/photo.height);
  const width=Math.round(photo.width*ratio),height=Math.round(photo.height*ratio);
  const anchors=Array.from({length:pages},(_,page)=>`<xdr:oneCellAnchor><xdr:from><xdr:col>${frame.col}</xdr:col><xdr:colOff>${frame.colOffset+Math.round((frame.width-width)/2)}</xdr:colOff><xdr:row>${frame.row+page*40}</xdr:row><xdr:rowOff>${frame.rowOffset+Math.round((frame.height-height)/2)}</xdr:rowOff></xdr:from><xdr:ext cx="${width}" cy="${height}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${page+1}" name="장비 사진 ${page+1}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`).join("");
  return `${XML}<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${R}">${anchors}</xdr:wsDr>`;
}
export class AssetCardWorkbook {
  private zip: StoredZip;
  private sheets: Array<{name:string;lastRow:number;photo:boolean}> = [];
  private styles: CardStyles;
  constructor(private template: Template, sink: ArchiveSink) { this.zip=new StoredZip(sink); this.styles=new CardStyles(template.stylesXml); }
  get bytesWritten() { return this.zip.bytesWritten; }
  get sheetCount() { return this.sheets.length; }
  private addText(name:string,text:string) { return this.zip.add(name,textEncoder.encode(text)); }
  async add(item:CardItem, photo:CardPhoto|null) {
    const name=cardSheetName(item.management_no),id=this.sheets.length+1;
    validateCardItems([item]);
    if(this.sheets.some(s=>s.name.toLowerCase()===name.toLowerCase()))throw new Error(`시트명 중복: ${name}`);
    await this.addText(`xl/worksheets/sheet${id}.xml`,renderCardSheet(item,name,this.template,!!photo,(style,size)=>this.styles.style(style,size)));
    if(photo){
      await this.zip.add(`xl/media/image${id}.${photo.extension}`,photo.bytes);
      await this.addText(`xl/drawings/drawing${id}.xml`,renderCardDrawing(photo,1,this.template));
      await this.addText(`xl/worksheets/_rels/sheet${id}.xml.rels`,`${XML}<Relationships xmlns="${P}"><Relationship Id="rId1" Type="${R}/drawing" Target="../drawings/drawing${id}.xml"/></Relationships>`);
      await this.addText(`xl/drawings/_rels/drawing${id}.xml.rels`,`${XML}<Relationships xmlns="${P}"><Relationship Id="rId1" Type="${R}/image" Target="../media/image${id}.${photo.extension}"/></Relationships>`);
    }
    this.sheets.push({name,lastRow:cardLastRow(item),photo:!!photo});
  }
  async finish() {
    if(!this.sheets.length)throw new Error("자산관리카드가 없습니다.");
    await this.addText("xl/styles.xml",this.styles.xml());
    await this.addText("xl/theme/theme1.xml",this.template.themeXml);
    const sheets=this.sheets.map((s,i)=>`<sheet name="${cardXml(s.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join("");
    const areas=this.sheets.map((s,i)=>`<definedName name="_xlnm.Print_Area" localSheetId="${i}">'${cardXml(s.name.replaceAll("'","''"))}'!$A$1:$H$${s.lastRow}</definedName>`).join("");
    await this.addText("xl/workbook.xml",`${XML}<workbook xmlns="${S}" xmlns:r="${R}"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${sheets}</sheets><definedNames>${areas}</definedNames><calcPr calcId="162913" fullCalcOnLoad="1"/></workbook>`);
    const relationships=this.sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="${R}/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join("");
    await this.addText("xl/_rels/workbook.xml.rels",`${XML}<Relationships xmlns="${P}">${relationships}<Relationship Id="styles" Type="${R}/styles" Target="styles.xml"/><Relationship Id="theme" Type="${R}/theme" Target="theme/theme1.xml"/></Relationships>`);
    await this.addText("_rels/.rels",`${XML}<Relationships xmlns="${P}"><Relationship Id="workbook" Type="${R}/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
    const types=this.sheets.map((s,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>${s.photo?`<Override PartName="/xl/drawings/drawing${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`:""}`).join("");
    await this.addText("[Content_Types].xml",`${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="png" ContentType="image/png"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${types}</Types>`);
    await this.zip.finish();
  }
}
