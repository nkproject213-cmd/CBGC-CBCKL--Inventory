import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
async function load() {
  if (process.env.IMPORT_NATIVE_TEST === '1') return import('../lib/excel-import.ts');
  const ts = (await import('typescript')).default;
  const source = fs.readFileSync(new URL('../lib/excel-import.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true });
  assert.equal(compiled.diagnostics?.length || 0, 0);
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled.outputText)(require, module, module.exports);
  return module.exports;
}
const { planImport, executeImport, importDate, IMPORT_COLUMNS, UPDATE_IMPORT_SQL, INSERT_IMPORT_SQL } = await load();
const cell = (value, numFmt = '') => ({ value, numFmt, text: value == null ? '' : String(value) });
function sheet(rows) {
  const cells = rows.map(row => row.map(value => value && value.__cell ? value.__cell : cell(value)));
  return { rowCount: rows.length, getRow: row => ({ getCell: column => cells[row-1]?.[column-1] || cell(null), eachCell: callback => (cells[row-1] || []).forEach((c,i) => callback(c,i+1)) }) };
}
const key = 'CBGC-001';
const existing = new Set([key, '0007', '기']);
const parse = rows => planImport(sheet(rows), existing);
let plan = parse([['관리번호','위치','물품사진 URL','수량'],[key,'새 장소','',0]]);
assert.deepEqual(plan.updates[0].patch, { storage_location:'새 장소', quantity:0 });
assert.equal(plan.errors.length,0);
assert.equal(parse([['관리번호'],[key]]).updates.length,1);
assert.equal(parse([['관리번호','품명'],['NEW','신규']]).errors.length,1);
assert.equal(parse([['관리번호','품명','물품유형'],['NEW','신규','PC']]).creates.length,1);
assert.deepEqual(parse([['관리번호','품명','물품유형','관리책임자 (부)'],[key,'','   ','부 담당']]).updates[0].patch, {manager_sub:'부 담당'});
for (const invalid of ['wrong', -1, 1.2, '1,2,3']) assert.equal(parse([['관리번호','수량'],[key,invalid]]).errors.length,1);
assert.equal(parse([['관리번호','수량'],[key,'1,500']]).updates[0].patch.quantity,1500);
assert.equal(parse([['관리번호','수량'],[key,{formula:'1-1',result:0}]]).updates[0].patch.quantity,0);
assert.deepEqual(parse([['관리번호','품명'],[key,{formula:'IF(1,"","")',result:''}]]).updates[0].patch,{});
assert.equal(parse([['관리번호','품명'],[key,{formula:'A2'}]]).errors.length,1);
assert.equal(parse([['관리번호','품명'],[key,{error:'#VALUE!'}]]).errors.length,1);
assert.equal(parse([['관리번호','품명'],[key,{richText:[{text:'물'},{text:'품'}]}]]).updates[0].patch.item_name,'물품');
assert.equal(parse([['관리번호','상태'],[{__cell:cell(7,'0000')},'정상']]).updates[0].management_no,'0007');
assert.equal(parse([['관리번호','상태'],[' 기 ','정상']]).updates[0].management_no,'기');
assert.equal(parse([['관리번호','물품사진URL'],[key,'javascript:alert(1)']]).errors.length,1);
assert.throws(()=>parse([['관리번호','위치','보관장소'],[key,'A','B']]),/중복/);
assert.throws(()=>parse([['품명'],['A']]),/관리번호/);
plan=parse([['관리번호','위치'],[key,'A'],[key,'B']]);
assert.equal(plan.updates.length,0); assert.equal(plan.errors.length,2);
assert.equal(importDate(new Date('2026-10-29T00:00:00Z')),'2026-10-29');
assert.equal(importDate('2024.2.29'),'2024-02-29');
assert.equal(importDate(1),'1900-01-01'); assert.equal(importDate(61),'1900-03-01');
assert.equal(importDate(0,true),'1904-01-01'); assert.throws(()=>importDate(60));
assert.throws(()=>importDate('2025-02-29')); assert.throws(()=>importDate('2025-13-01'));

// The fake query adapter runs the same parameterized patch payloads and models
// current-value COALESCE semantics. No production database is written by tests.
const original = {organization:'CBGC',management_no:key,id:'keep-id',public_id:'keep-qr',item_name:'원래 품명',item_type:'PC',photo_url:'https://example.com/photo.jpg',specification:'원래 규격',quantity:5,storage_location:'이전',updated_at:'old',manager_main:'정',manager_sub:'부'};
const db = new Map([['CBGC|'+key,{...original}],['CBCKL|'+key,{...original,organization:'CBCKL'}],['CBGC|OTHER',{...original,management_no:'OTHER'}]]);
let calls=0;
async function query(sql,[org,json]) {
  calls++; const values=JSON.parse(json);
  assert(!json.includes('public_id')); assert(!json.includes('"id"'));
  return values.flatMap(value=>{
    const k=org+'|'+value.management_no, before=db.get(k);
    if(sql===INSERT_IMPORT_SQL) {
      if(before) return [];
      db.set(k,{...value,organization:org,id:'new-id',public_id:'new-qr',updated_at:'new'});
      return [{management_no:value.management_no,action:'created'}];
    }
    assert.equal(sql,UPDATE_IMPORT_SQL);
    if(!before) return [{management_no:value.management_no,action:'missing'}];
    const patch=Object.fromEntries(Object.entries(value).filter(([key])=>key!=='management_no'));
    const changed=Object.entries(patch).some(([key,val])=>before[key]!==val);
    if(changed) db.set(k,{...before,...patch,updated_at:'updated'});
    return [{management_no:value.management_no,action:changed?'updated':'unchanged'}];
  });
}
plan=parse([['관리번호','위치','물품사진URL','수량'],[key,'새 장소','',0]]);
let result=await executeImport(plan,'CBGC',query);
assert.equal(result.updated,1); assert.equal(result.created,0);
assert.deepEqual(db.get('CBGC|'+key),{...original,storage_location:'새 장소',quantity:0,updated_at:'updated'});
assert.deepEqual(db.get('CBCKL|'+key),{...original,organization:'CBCKL'});
assert.deepEqual(db.get('CBGC|OTHER'),{...original,management_no:'OTHER'});
result=await executeImport(plan,'CBGC',query); assert.equal(result.unchanged,1); assert.equal(result.updated,0);
result=await executeImport(parse([['관리번호'],[key]]),'CBGC',query); assert.equal(result.unchanged,1);
result=await executeImport(parse([['관리번호','품명','물품유형'],['NEW','신규','PC']]),'CBGC',query); assert.equal(result.created,1);
// Concurrent insert is handled as a partial update, not delete-and-recreate.
plan=parse([['관리번호','품명','물품유형'],['RACE','수정','PC']]);
db.set('CBGC|RACE',{...original,management_no:'RACE'});
result=await executeImport(plan,'CBGC',query); assert.equal(result.updated,1); assert.equal(db.get('CBGC|RACE').public_id,'keep-qr'); assert.equal(db.get('CBGC|RACE').photo_url,original.photo_url);
// Another editor's change to an absent column is preserved at execution time.
plan=parse([['관리번호','위치'],[key,'장소3']]);
db.get('CBGC|'+key).manager_main='동시 수정';
await executeImport(plan,'CBGC',query); assert.equal(db.get('CBGC|'+key).manager_main,'동시 수정');
const many=Array.from({length:1500},(_,i)=>({row:i+2,management_no:'M-'+i,patch:{item_name:'물품'+i,item_type:'PC'}}));
calls=0; result=await executeImport({updates:[],creates:many,errors:[],skipped:0},'CBGC',query);
assert.equal(result.created,1500); assert.equal(calls,30);
assert(UPDATE_IMPORT_SQL.includes('i.organization = $1 AND i.management_no = p.management_no'));
assert(UPDATE_IMPORT_SQL.includes('IS DISTINCT FROM'));
assert(!/\bDELETE\b|\bTRUNCATE\b/i.test(UPDATE_IMPORT_SQL+INSERT_IMPORT_SQL));
for(const key of Object.values(IMPORT_COLUMNS)) assert(UPDATE_IMPORT_SQL.includes(`COALESCE(p.${key}, i.${key})`));

if(process.env.IMPORT_NATIVE_TEST!=='1') {
  const ExcelJS=(await import('exceljs')).default;
  const workbook=new ExcelJS.Workbook(); const ws=workbook.addWorksheet('물품업로드');
  ws.addRow(['관리번호','위치','수량','취득일자','물품사진URL']);
  ws.addRow(['0007','회의실',0,new Date('2026-10-29T00:00:00Z'),'']);
  const loaded=new ExcelJS.Workbook(); await loaded.xlsx.load(await workbook.xlsx.writeBuffer());
  const roundtrip=planImport(loaded.getWorksheet('물품업로드'),existing);
  assert.deepEqual(roundtrip.updates[0].patch,{acquired_date:'2026-10-29',storage_location:'회의실',quantity:0});
}
console.log('Excel partial-import tests passed: management-number matching, missing/blank preservation, 0 values, stable photo/QR IDs, organization isolation, dates, validation, duplicates, concurrent inserts/edits, and 1500 rows in 30 batches.');
