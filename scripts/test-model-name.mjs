import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import ExcelJS from 'exceljs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
function loadTs(path, stubs = {}) {
  const result = ts.transpileModule(read(path), {
    fileName: path,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
    reportDiagnostics: true,
  });
  assert.equal(result.diagnostics?.length || 0, 0, path + ' parses');
  const module = { exports: {} };
  const scopedRequire = name => Object.hasOwn(stubs, name) ? stubs[name] : require(name);
  new Function('require', 'module', 'exports', result.outputText)(scopedRequire, module, module.exports);
  return module.exports;
}
function sheet(headers, rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('물품업로드');
  ws.addRow(headers); rows.forEach(row => ws.addRow(row));
  return ws;
}
const price = loadTs('lib/purchase-price.ts');
const fields = loadTs('lib/flexible-fields.ts');
const sharedPhotos = loadTs('lib/shared-photo.ts', { './flexible-fields': fields });
const fieldDependencies = { './purchase-price': price, './flexible-fields': fields };
const engine = loadTs('lib/excel-import.ts', fieldDependencies);
const validation = loadTs('lib/validation.ts', fieldDependencies);
assert.equal(engine.IMPORT_COLUMNS['품명'], 'item_name');
assert.equal(engine.IMPORT_COLUMNS['모델명'], 'model_name');
assert(!Object.hasOwn(engine.IMPORT_COLUMNS, '제품명'));
const existing = new Set(['A', 'B']);
let plan = engine.planImport(sheet(['관리번호', '모델명'], [['A', ' SM-S938 '], ['B', '  ']]), existing);
assert.deepEqual(plan.updates[0].patch, { model_name: 'SM-S938' });
assert.deepEqual(plan.updates[1].patch, {});
assert.deepEqual(engine.planImport(sheet(['관리번호', '보관장소'], [['A', '새 장소']]), existing).updates[0].patch, { storage_location: '새 장소' });
assert.deepEqual(engine.planImport(sheet(['관리번호', '모델명'], [['NEW', 'M1']]), existing).creates[0].patch, { model_name: 'M1' });
assert.equal(engine.planImport(sheet(['관리번호', '품명', '물품유형', '모델명'], [['NEW', '노트북', 'PC', '0012']]), existing).creates[0].patch.model_name, '0012');
const padded = sheet(['관리번호', '모델명'], [['A', 12]]);
padded.getCell('B2').numFmt = '0000';
assert.equal(engine.planImport(padded, existing).updates[0].patch.model_name, '0012');
assert.equal(engine.planImport(sheet(['관리번호', '모델명'], [['A', 0]]), existing).updates[0].patch.model_name, '0');
assert.match(engine.UPDATE_IMPORT_SQL, /model_name = COALESCE\(p\.model_name, i\.model_name\)/);
assert.match(engine.INSERT_IMPORT_SQL, /model_name/);

// Exercise the actual import executor with isolated records, never production data.
const records = new Map([
  ['CBGC:A', { management_no: 'A', model_name: 'old', item_name: '품명 유지', public_id: 'qr-original', photo_url: 'https://example.invalid/photo.png' }],
  ['CBGC:B', { management_no: 'B', model_name: 'keep' }],
  ['CBCKL:A', { management_no: 'A', model_name: 'other-org' }],
]);
async function query(text, [org, json]) {
  assert.equal(text, engine.UPDATE_IMPORT_SQL);
  return JSON.parse(json).map(({ management_no, ...patch }) => {
    const row = records.get(org + ':' + management_no);
    if (!row) return { management_no, action: 'missing' };
    const changed = Object.entries(patch).some(([key, value]) => row[key] !== value);
    Object.assign(row, patch);
    return { management_no, action: changed ? 'updated' : 'unchanged' };
  });
}
const imported = await engine.executeImport(plan, 'CBGC', query);
assert.equal(imported.updated, 1); assert.equal(imported.unchanged, 1);
assert.equal(records.get('CBGC:A').model_name, 'SM-S938');
assert.equal(records.get('CBGC:A').item_name, '품명 유지');
assert.equal(records.get('CBGC:A').public_id, 'qr-original');
assert.equal(records.get('CBGC:A').photo_url, 'https://example.invalid/photo.png');
assert.equal(records.get('CBGC:B').model_name, 'keep');
assert.equal(records.get('CBCKL:A').model_name, 'other-org');
assert.equal((await engine.executeImport(plan, 'CBGC', query)).unchanged, 2);

const base = { organization: 'CBGC', management_no: 'A', item_type: 'PC', item_name: '테스트 품명', model_name: 'SM-S938', public_id: '00000000-0000-4000-8000-000000000001', photo_url: null };
assert.equal(validation.itemSchema.parse({ ...base, model_name: undefined }).model_name, null);
assert.equal(validation.itemSchema.parse({ ...base, model_name: '  M2  ' }).model_name, 'M2');
assert.equal(validation.itemSchema.parse({ ...base, model_name: '' }).model_name, null);
class NextResponse extends Response {
  static json(data, init) { return new NextResponse(JSON.stringify(data), { ...init, headers: { 'content-type': 'application/json', ...init?.headers } }); }
}
let admin = true;
const auth = { isAdmin: async () => admin };
const template = loadTs('app/api/items/import-template/route.ts', { 'next/server': { NextResponse }, '@/lib/auth': auth });
admin = false; assert.equal((await template.GET()).status, 401); admin = true;
const templateResponse = await template.GET();
const templateBook = new ExcelJS.Workbook();
await templateBook.xlsx.load(Buffer.from(await templateResponse.arrayBuffer()));
const input = templateBook.getWorksheet('물품업로드');
const headers = input.getRow(1).values.slice(1);
assert.equal(headers.length, 18); assert.equal(headers[5], '품명'); assert.equal(headers[6], '모델명');
assert.equal(input.getColumn(7).numFmt, '@'); assert.equal(input.getColumn(17).numFmt, '0');
assert.equal(input.actualRowCount, 1, 'Input template must have no example item data');
const example = templateBook.getWorksheet('작성예시');
assert.equal(example.getCell('G2').value, 'EXAMPLE-001');
assert.equal(example.getCell('H2').value, 1500000);
assert.equal(example.getCell('J3').value, '새 보관장소');
assert.equal(example.getCell('Q3').value, 0);
assert.equal(example.getCell('G4').value, 'SM-S938');
const examplePlan = engine.planImport(example, new Set(['기존-관리번호-입력', '모델명-수정할-관리번호']));
assert.equal(examplePlan.errors.length, 0);
assert.deepEqual(examplePlan.updates[1].patch, { model_name: 'SM-S938' });
const exportPrices = ['-', '미상', '1,234.5', 0, '=1+2', null];
const exportItems = exportPrices.map((purchase_price, i) => ({ ...base, management_no: i ? 'PRICE-' + i : 'A', model_name: '0012', quantity: 0, purchase_price }));
Object.assign(exportItems[0], { acquired_date:'확인 중', useful_life_years:'-', quantity:'1.5', photo_url_text:'사진 준비 중' });
const exportRoute = loadTs('app/api/export/route.ts', { 'next/server': { NextResponse }, '@/lib/auth': auth, '@/lib/db': { listItems: async () => exportItems }, '@/lib/validation': validation, '@/lib/purchase-price': price });
const exportResponse = await exportRoute.GET({ nextUrl: new URL('https://example.invalid/api/export?org=CBGC') });
const exportBook = new ExcelJS.Workbook();
await exportBook.xlsx.load(Buffer.from(await exportResponse.arrayBuffer()));
const exported = exportBook.getWorksheet('CBGC');
assert.equal(exported.getCell('F1').value, '품명');
assert.equal(exported.getCell('G1').value, '모델명');
assert.equal(exported.getCell('G2').value, '0012');
assert.equal(exported.autoFilter, 'A1:R1');
assert.deepEqual(exportPrices.map((_, i) => exported.getCell(i + 2, 8).value), ['-', '미상', 1234.5, 0, '=1+2', null]);
assert.equal(exported.getCell('H6').type, ExcelJS.ValueType.String);
const priceRoundTrip = engine.planImport(exported, new Set(exportItems.map(item => item.management_no)));
assert.deepEqual(priceRoundTrip.updates.map(row => row.patch.purchase_price), ['-', '미상', 1234.5, 0, '=1+2', undefined]);
assert.equal(priceRoundTrip.updates[0].patch.acquired_date,'확인 중');
assert.equal(priceRoundTrip.updates[0].patch.useful_life_years,'-');
assert.equal(priceRoundTrip.updates[0].patch.quantity,'1.5');
assert.equal(priceRoundTrip.updates[0].patch.photo_url,'사진 준비 중');
assert.equal(engine.planImport(exported, existing).updates[0].patch.model_name, '0012');

// Actual public-page rendering with read-only fixtures, including blank/XSS cases.
let publicItem = { ...base };
const photo = loadTs('components/ItemPhoto.tsx', {
  'next/image': props => React.createElement('img', { src: props.src, alt: props.alt }),
  '@/lib/flexible-fields': fields,
});
const publicPage = loadTs('app/item/[publicId]/page.tsx', {
  '@/components/ItemPhoto': photo,
  'next/link': props => React.createElement('a', { href: props.href }, props.children),
  'next/navigation': { notFound() { throw new Error('not found'); } },
  '@/lib/db': { getPublicItem: async () => publicItem }, '@/lib/auth': { isAdmin: async () => false },
});
const renderPublic = async () => renderToStaticMarkup(await publicPage.default({ params: Promise.resolve({ publicId: base.public_id }) }));
let html = await renderPublic();
assert(html.includes('<b>품명</b>')); assert(html.includes('<b>모델명</b><span>SM-S938</span>')); assert(!html.includes('제품명'));
publicItem = { ...base, model_name: null }; html = await renderPublic();
assert(html.includes('<b>모델명</b><span>-</span>'));
publicItem = { ...base, model_name: '<script>alert(1)</script>' }; html = await renderPublic();
assert(html.includes('&lt;script&gt;')); assert(!html.includes('<script>alert(1)</script>'));

// Older open tabs preserve model_name; explicit clearing is allowed in the detail editor.
let savedData;
const patchRoute = loadTs('app/api/items/[id]/route.ts', {
  'next/server': { NextResponse }, '@vercel/blob': { del: async () => {} }, '@/lib/auth': auth,
  '@/lib/db': { getItem: async () => base, updateItem: async (_, data) => { savedData = data; return { ...base, ...data }; } },
  '@/lib/validation': validation,
  '@/lib/shared-photo': sharedPhotos,
});
const patch = data => patchRoute.PATCH(new Request('https://example.invalid/api/items/id', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) }), { params: Promise.resolve({ id: 'id' }) });
assert.equal((await patch({ specification: 'new' })).status, 200); assert.equal(savedData.model_name, 'SM-S938');
assert.equal((await patch({ model_name: 'M2' })).status, 200); assert.equal(savedData.model_name, 'M2');
assert.equal((await patch({ model_name: '' })).status, 200); assert.equal(savedData.model_name, null);
const form = read('components/AdminConsole.tsx');
assert(form.includes('["model_name","모델명"]'));
assert(form.includes('model_name:i.model_name||""'));
assert(form.includes('model_name:form.model_name.trim()||null'));
assert(form.includes('["item_name","품명"]')); assert(!form.includes('제품명'));
const db = read('lib/db.ts');
assert(db.includes('ADD COLUMN IF NOT EXISTS model_name TEXT'));
assert(db.includes('item_name, model_name, storage_location'));
assert(db.includes('model_name = ${data.model_name ?? null}'));
console.log('Model-name tests passed: optional field, partial updates/blank preservation, old tabs, model-only import, numeric codes, actual template/export XLSX roundtrips, public-page rendering/XSS, unchanged item-name labels. No production data modified.');
