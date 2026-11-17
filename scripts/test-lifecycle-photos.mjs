import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import JSZip from 'jszip';
import ExcelJS from 'exceljs';
const require = createRequire(import.meta.url);
const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
function load(file, stubs = {}) {
  const result = ts.transpileModule(read(file), {fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX},reportDiagnostics:true});
  assert.equal(result.diagnostics.length, 0, file + ' parses');
  const module = { exports:{} };
  new Function('require','module','exports',result.outputText)(name=>Object.hasOwn(stubs,name)?stubs[name]:require(name),module,module.exports);
  return module.exports;
}
const life = load('lib/lifecycle.ts');
assert.equal(life.koreaToday(new Date('2026-11-16T14:59:59Z')), '2026-11-16');
assert.equal(life.koreaToday(new Date('2026-11-16T15:00:00Z')), '2026-11-17');
assert.equal(life.usefulLifeEnd('2020-02-29',1),'2021-02-28');
assert.equal(life.usefulLifeEnd('2020-02-29',4),'2024-02-29');
assert.equal(life.usefulLifeEnd('2021-11-17',5),'2026-11-17');
assert.equal(life.hasUsefulLifeExpired('2021-11-17',5,'2026-11-16'),false);
assert.equal(life.hasUsefulLifeExpired('2021-11-17',5,'2026-11-17'),true);
for(const [date,years] of [[null,5],['2020-01-01',null],['2021-02-29',2],['2020-01-01',-1],['2020-01-01',1.5],['2020-01-01',2147483647]]) assert.equal(life.usefulLifeEnd(date,years),null);
assert.equal(life.hasUsefulLifeExpired('2026-11-17',0,'2026-11-17'),true);
assert(life.SYNC_LIFE_STATUS_SQL.includes('Asia/Seoul'));
assert(life.SYNC_LIFE_STATUS_SQL.includes('status_before_life_expiry'));
assert(life.SYNC_LIFE_STATUS_SQL.includes('i.organization = $1'));
assert(!/DELETE|TRUNCATE/.test(life.SYNC_LIFE_STATUS_SQL));
const photos=load('lib/photo-archive.ts');
assert.equal(photos.crc32(new TextEncoder().encode('123456789')),0xcbf43926);
assert.equal(photos.imageExtension('image/webp; charset=binary'),'webp');
assert.equal(photos.imageExtension('text/html'),null);
assert(!photos.safePhotoName('../한글/사진:*?').includes('/'));
assert(photos.csvText([['=danger','"quote"']]).includes("'=danger"));
for(const count of [0,1,27,1500]) {
  const chunks=[]; const zip=new photos.StoredZip({write:async bytes=>chunks.push(bytes)});
  for(let i=0;i<count;i++)await zip.add(`CBGC/${String(i).padStart(4,'0')}_한글사진.webp`,new Uint8Array([i%256,2,3,4]));
  await zip.add('목록.csv',new TextEncoder().encode('한글,수량\r\n테스트,0'));
  await zip.finish();
  const packed=Buffer.concat(chunks); assert.equal(zip.bytesWritten,packed.length);
  const decoded=await JSZip.loadAsync(packed,{checkCRC32:true});
  assert.equal(Object.keys(decoded.files).length,count+1);
  assert.equal(await decoded.file('목록.csv').async('string'),'한글,수량\r\n테스트,0');
  if(count)assert.deepEqual([...await decoded.file('CBGC/0000_한글사진.webp').async('uint8array')],[0,2,3,4]);
  await assert.rejects(()=>zip.add('bad',new Uint8Array()),/완료/);
}
const invalid=new photos.StoredZip({write:async()=>{}});
await assert.rejects(()=>invalid.add('../escape.png',new Uint8Array([1])),/파일명/);
const broken=new photos.StoredZip({write:async()=>{throw new Error('disk full');}});
await assert.rejects(()=>broken.add('test.png',new Uint8Array([1])),/disk full/);
class NextResponse extends Response { static json(value,init){return new NextResponse(JSON.stringify(value),{...init,headers:{'Content-Type':'application/json',...init?.headers}});} }
let admin=false;const called=[];
const manifest=load('app/api/items/photo-manifest/route.ts',{'next/server':{NextResponse},'@/lib/auth':{isAdmin:async()=>admin},'@/lib/db':{listItems:async org=>{called.push(org);return [{id:org+'1',organization:org,management_no:'A-2',item_name:'품명',photo_url:'https://example.invalid/2.webp',purchase_price:9000},{id:org+'2',organization:org,management_no:'A-1',photo_url:null}];}}});
const request=org=>({nextUrl:new URL('https://example.invalid/api/items/photo-manifest?org='+org)});
assert.equal((await manifest.GET(request('ALL'))).status,401);assert.equal(called.length,0);
admin=true;assert.equal((await manifest.GET(request('invalid'))).status,400);
let body=await (await manifest.GET(request('CBGC'))).json();assert.equal(body.items.length,1);assert.equal(body.withoutPhoto,1);assert.deepEqual(called,['CBGC']);assert(!('purchase_price' in body.items[0]));
body=await (await manifest.GET(request('ALL'))).json();assert.equal(body.items.length,2);assert.equal(body.withoutPhoto,2);
const exportRoute=load('app/api/export/route.ts',{'next/server':{NextResponse},'@/lib/auth':{isAdmin:async()=>true},'@/lib/validation':{organizationSchema:{parse:value=>value}},'@/lib/db':{listItems:async()=>[{management_no:'A',item_status:'내용연수 경과'},{management_no:'B',item_status:'사용 중'}]}});
for(const filtered of [false,true]) {
  const response=await exportRoute.GET({nextUrl:new URL('https://example.invalid/api/export?org=CBGC'+(filtered?'&expired=1':''))});
  const book=new ExcelJS.Workbook();await book.xlsx.load(Buffer.from(await response.arrayBuffer()));
  assert.equal(book.worksheets[0].rowCount,filtered?2:3);
  assert.equal(book.worksheets[0].getCell('R2').value,'내용연수 경과');
}
const form=read('components/AdminConsole.tsx');assert(form.includes('내용연수 경과만 보기'));assert(form.includes('sortedItems.filter(i=>selectedIds.has(i.id))'));assert(form.includes('PhotoArchiveButton org={org}'));
assert(read('app/api/items/import/route.ts').includes('await syncExpiredStatuses(org)'));
console.log('Lifecycle/photo tests passed: Korean midnight, anniversary/leap day, missing/zero years, filter/delete scope, filtered XLSX, manifest auth/org isolation, 1500-file Unicode ZIP+CRC, disk failure, and photo bytes preserved.');
