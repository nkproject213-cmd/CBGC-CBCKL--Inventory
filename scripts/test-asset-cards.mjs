import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import JSZip from 'jszip';
import ExcelJS from 'exceljs';
const require=createRequire(import.meta.url);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','lib');
const cache=new Map();
function load(file){
  const full=path.join(root,file+'.ts');if(cache.has(full))return cache.get(full);
  const source=fs.readFileSync(full,'utf8');
  const result=ts.transpileModule(source,{fileName:full,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true},reportDiagnostics:true});
  assert.equal(result.diagnostics?.length||0,0,'TypeScript parse: '+file);
  const module={exports:{}};
  new Function('require','module','exports',result.outputText)(name=>name.startsWith('./')?load(name.slice(2)):require(name),module,module.exports);
  cache.set(full,module.exports);return module.exports;
}
const cards=load('asset-cards'),template=await cards.loadCardTemplate();
assert.equal(template.sourceSha256,'beb0df155a544ba7aed7ca8b501728544c0a91567c2f7bd2b887e475c1b3f0a6');
assert(!template.sheetXml.includes('백 인 석'));
assert(!/t="s"|<hyperlink|<drawing|<f[ >]/.test(template.sheetXml));
assert(template.sheetXml.includes('width="10.625"'));
assert(template.sheetXml.includes('<mergeCells count="61">'));
for(const [input,expected] of [['CBGC-001','CB-1'],['CBCKL-00242','CB-242'],['CB-003','CB-3'],['test2','CB-test2'],['CBGC-000','CB-0']])assert.equal(cards.cardSheetName(input),expected);
for(const input of ['','CBGC-','A/B',':','a'.repeat(40)])assert.throws(()=>cards.cardSheetName(input));
const sample={organization:'CBGC',management_no:'CBGC-001',item_type:'책상',item_name:'책상',model_name:'Computer desk',acquired_date:'2018-09-28',purchase_price:249700,useful_life_years:9,manager_main:'백인석',manager_sub:'황선유',storage_location:'공유오피스',accessories:'-',specification:'1200×800×730 mm',classification_no:'56101703',identification_no:'비조달',photo_url:null};
assert.throws(()=>cards.validateCardItems([sample,{...sample,management_no:'CBGC-01'}]),/중복/);
const cell=(xml,ref)=>xml.match(new RegExp(`<c\\b(?=[^>]*\\br="${ref}")[^>]*?/>|<c\\b(?=[^>]*\\br="${ref}")[^>]*?>[\\s\\S]*?<\\/c>`))?.[0];
let xml=cards.renderCardSheet(sample,'CB-1',template,false);
assert.equal(xml.match(/<row r=/g).length,40);
assert(xml.includes('<mergeCells count="61">'));
assert(cell(xml,'B1').includes('CB-1'));assert(cell(xml,'C6').includes('CBGC-001'));
assert(cell(xml,'C7').includes('2018.9.28.'));assert(cell(xml,'G7').includes('Computer desk'));
assert(cell(xml,'C4').includes('백 인 석 (인)'));assert(cell(xml,'G8').endsWith('/>'));
assert(cell(xml,'C32').includes('<v>27744.444444444445</v>'));
assert(cell(xml,'D40').includes('<v>249700</v>'));assert(cell(xml,'E40').includes('<v>0</v>'));
assert(cell(xml,'G40').includes('<v>2026</v>'));
assert(cell(cards.renderCardSheet({...sample,purchase_price:'249700'},'CB-1',template,false),'C8').includes('<v>249700</v>'));
assert.equal(xml.match(/<cols>[\s\S]*?<\/cols>/)[0],template.sheetXml.match(/<cols>[\s\S]*?<\/cols>/)[0]);
assert.equal(xml.match(/<pageMargins[^>]*\/>/)[0],template.sheetXml.match(/<pageMargins[^>]*\/>/)[0]);
const rowFormats=content=>[...content.matchAll(/<row\b[^>]*>/g)].map(m=>m[0]);
assert.deepEqual(rowFormats(xml),rowFormats(template.sheetXml));
xml=cards.renderCardSheet({...sample,purchase_price:null,useful_life_years:null,manager_main:null,manager_sub:null},'CB-1',template,false);
for(const ref of ['C4','G4','C8','C9','G8'])assert(cell(xml,ref).endsWith('/>'));
assert(!/<v>(?:NaN|Infinity|#)/.test(xml));assert(!xml.includes('drawing'));
xml=cards.renderCardSheet({...sample,useful_life_years:0},'CB-1',template,false);assert(!xml.includes('<v>NaN'));
for(const years of [1,5,7,9,12,13,15,20,100]) {
  const item={...sample,useful_life_years:years};
  xml=cards.renderCardSheet(item,'CB-1',template,true);
  assert.equal(xml.match(/<row r=/g).length,31+years);
  assert.equal(cards.cardPageCount(item),1);assert.equal(cards.cardLastRow(item),31+years);
  assert(Math.abs(cards.scheduleHeights(item).reduce((a,b)=>a+b,0)-189)<1e-9);
  assert(!xml.includes('<rowBreaks'));assert(xml.includes('fitToHeight="1"'));
  assert.equal((xml.match(/자산취득 물품 관리카드/g)||[]).length,1);
  assert(cell(xml,'A'+(31+years)).includes('<v>'+years+'</v>'));
  assert(cell(xml,'E'+(31+years)).includes('<v>0</v>'));
  assert.deepEqual(rowFormats(xml).slice(0,31),rowFormats(template.sheetXml).slice(0,31));
}
xml=cards.renderCardSheet({...sample,useful_life_years:12},'CB-1',template,true);
assert.equal(xml.match(/<row r=/g).length,43);assert(cell(xml,'A41').includes('<v>10</v>'));assert(cell(xml,'G41').includes('<v>2027</v>'));
assert(xml.includes('ht="15.75"'));assert(xml.includes('ref="B32:B43"'));
assert.throws(()=>cards.validateCardItems([{...sample,useful_life_years:101}]),/100년/);
xml=cards.renderCardSheet({...sample,model_name:'=HYPERLINK("x")<script>&'},'CB-1',template,false);assert(cell(xml,'G7').includes('t="inlineStr"'));assert(cell(xml,'G7').includes('&lt;script&gt;'));assert(!cell(xml,'G7').includes('<f>'));
const png=new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==','base64'));
const photo={bytes:png,width:1,height:1,extension:'png'};
const chunks=[],book=new cards.AssetCardWorkbook(template,{write:async b=>chunks.push(b)});
await book.add(sample,photo);await book.add({...sample,management_no:'CBGC-002',model_name:null},null);await book.add({...sample,management_no:'CBGC-003',useful_life_years:12},photo);await book.finish();
const archive=await JSZip.loadAsync(Buffer.concat(chunks),{checkCRC32:true});
assert.equal(await archive.file('xl/styles.xml').async('string'),template.stylesXml);assert.equal(await archive.file('xl/theme/theme1.xml').async('string'),template.themeXml);
assert(!Object.keys(archive.files).some(name=>/externalLink|calcChain|sharedStrings|image2/.test(name)));
assert(!archive.file('xl/worksheets/_rels/sheet2.xml.rels'));
assert.equal((await archive.file('xl/drawings/drawing3.xml').async('string')).match(/<xdr:oneCellAnchor>/g).length,1);
const wb=await archive.file('xl/workbook.xml').async('string');assert(wb.includes('name="CB-1"'));assert(wb.includes('name="CB-2"'));assert(wb.includes('localSheetId="2"'));assert(wb.includes('$H$43'));
for(const name of Object.keys(archive.files).filter(name=>name.endsWith('.rels'))){
  const relationships=await archive.file(name).async('string');const base=name==='_rels/.rels'?'':path.posix.dirname(path.posix.dirname(name));
  for(const match of relationships.matchAll(/Target="([^"]+)"/g))assert(archive.file(path.posix.normalize(path.posix.join(base,match[1]))),'Missing relationship '+match[1]);
}
const decoded=new ExcelJS.Workbook();await decoded.xlsx.load(Buffer.concat(chunks));
assert.equal(decoded.worksheets.length,3);
assert.equal(decoded.getWorksheet('CB-1').getImages().length,1);
assert.equal(decoded.getWorksheet('CB-2').getImages().length,0);
assert.equal(decoded.getWorksheet('CB-3').getImages().length,1);
assert.equal(decoded.getWorksheet('CB-3').getRow(32).height,15.75);
assert.equal(decoded.getWorksheet('CB-3').pageSetup.fitToHeight,1);
assert.equal(decoded.getWorksheet('CB-3').getCell('E43').result,0);
// Verify actual workbook cell types, display formats and cached formulas for flexible prices.
const priceChunks = [];
const priceBook = new cards.AssetCardWorkbook(template, { write: async bytes => priceChunks.push(bytes) });
for (const [index, price] of ["-", "=1+1", "123.75", 0, "-10", null].entries()) {
  await priceBook.add({ ...sample, management_no: `CBGC-${index + 1}`, purchase_price: price, useful_life_years: 3 }, null);
}
await priceBook.finish();
const priceSheets = new ExcelJS.Workbook();
await priceSheets.xlsx.load(Buffer.concat(priceChunks));
for (const [index, expected] of ["-", "=1+1", 123.75, 0, -10, null].entries()) {
  const sheet = priceSheets.getWorksheet(`CB-${index + 1}`);
  assert.equal(sheet.getCell('C8').value, expected);
  if (typeof expected === 'number' && expected >= 0) {
    assert.equal(sheet.getCell('B32').result, expected);
    assert.equal(sheet.getCell('C32').result, expected / 3);
    assert.equal(sheet.getCell('E34').result, 0);
    if (!Number.isInteger(expected)) {
      for (const addr of ['C8', 'B32', 'C32', 'D32', 'E32']) {
        assert.equal(sheet.getCell(addr).numFmt || 'General', 'General');
      }
    }
  } else {
    for (const addr of ['B32', 'C32', 'D32', 'E32']) {
      assert.equal(sheet.getCell(addr).result || '', '');
      assert.notEqual(sheet.getCell(addr).result, 0);
    }
  }
}
const noteChunks = [];
const notes = new cards.AssetCardWorkbook(template, { write: async bytes => noteChunks.push(bytes) });
await notes.add({ ...sample, acquired_date: "2020-01-01 이전", useful_life_years: "미상" }, null);
await notes.add({ ...sample, management_no: "CBGC-002", acquired_date: "미상" }, null);
await notes.finish();
const noteCards = new ExcelJS.Workbook();
await noteCards.xlsx.load(Buffer.concat(noteChunks));
const noteCard = noteCards.getWorksheet("CB-1");
assert.equal(noteCard.getCell("C7").value, "2020-01-01 이전");
assert.equal(noteCard.getCell("C9").value, "미상");
assert.equal(noteCard.getCell("G32").value, null);
assert.equal(noteCard.getCell("C32").result || "", "");
assert.equal(noteCards.getWorksheet("CB-2").getCell("G32").value, null);
const smaller=[];const fitted=new cards.AssetCardWorkbook(template,{write:async b=>smaller.push(b)});
await fitted.add({...sample,useful_life_years:20},null);await fitted.finish();
const smallZip=await JSZip.loadAsync(Buffer.concat(smaller));
const smallStyles=await smallZip.file('xl/styles.xml').async('string');
assert(smallStyles.includes('<sz val="6.5"/>'));assert(smallStyles.includes('<fonts count="7">'));
const stress=Array.from({length:1500},(_,i)=>({...sample,management_no:'CBGC-'+String(i+1)}));cards.validateCardItems(stress);
let emitted=0;const large=new cards.AssetCardWorkbook(template,{write:async b=>{emitted+=b.length;}});
for(const item of stress)await large.add(item,null);await large.finish();assert.equal(large.sheetCount,1500);assert(emitted>10000000);
const broken=new cards.AssetCardWorkbook(template,{write:async()=>{throw new Error('disk full');}});await assert.rejects(()=>broken.add(sample,null),/disk full/);
console.log('Asset-card tests passed: template styles/upper geometry, fixed-height depreciation for 1/5/9/12/20/100 years, one-page print, CB numbers, blank/photos via ExcelJS, formulas/cache, CRC, XML safety and 1500-sheet streaming.');
