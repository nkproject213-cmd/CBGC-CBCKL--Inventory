import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function loadTs(path, stubs = {}) {
  const source = fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
  const result = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    reportDiagnostics: true,
  });
  assert.equal(result.diagnostics?.length || 0, 0, 'TypeScript parse errors in ' + path);
  const module = { exports: {} };
  new Function('require', 'module', 'exports', result.outputText)(name => Object.hasOwn(stubs, name) ? stubs[name] : require(name), module, module.exports);
  return module.exports;
}
const { labelFields, labelDate, renderQrLabelDocument } = loadTs('lib/qr-print.ts');
const price = loadTs('lib/purchase-price.ts');
const fields = loadTs('lib/flexible-fields.ts');
const { itemSchema } = loadTs('lib/validation.ts', { './purchase-price': price, './flexible-fields': fields });
const item = {
  public_id: '00257316-06de-4723-9876-5c7e5bcb4561',
  item_name: '테스트 물품', management_no: 'CBGC-1', specification: '15인치 / 16GB',
  unit: '대', quantity: 0, acquired_date: '2025-06-09', item_status: '사용 중',
  storage_location: '게임센터 사무실', manager_main: '홍길동', manager_sub: '김영희',
};
const names = ['품명','관리번호','규격','단위','수량','취득일자','상태','위치','관리책임자(정)','관리책임자(부)'];
assert.deepEqual(labelFields(item).map(([key]) => key), names);
assert.equal(labelFields(item)[4][1], '0');
assert.equal(labelFields({ ...item, unit: null })[3][1], '-');
assert.equal(labelFields({ ...item, quantity: null })[4][1], '-');
assert.equal(labelDate(new Date('2025-06-09T00:00:00Z')), '2025-06-09');
assert.equal(labelDate(null), '-');
assert.equal(labelDate('2020-01-01 이전'), '2020-01-01 이전');
assert.equal(labelFields({ ...item, quantity: '미상' })[4][1], '미상');
const qr = new Map([[item.public_id, '<svg viewBox="0 0 10 10"></svg>']]);
for (const count of [0,1,27,28,54,1500]) {
  const html = renderQrLabelDocument('CBGC', Array.from({length: count}, (_,i) => ({ ...item, management_no: 'CBGC-' + i })), qr);
  assert.equal((html.match(/<section class="sheet">/g)||[]).length, Math.ceil(count/27));
  assert.equal((html.match(/<article class="label"/g)||[]).length, count);
  assert(html.includes('padding:11mm 0 0 8mm'));
  assert(html.includes('repeat(3,62.7mm)'));
  assert(html.includes('repeat(9,30.1mm)'));
  assert(!html.includes('custom-image'));
}
const escaped = renderQrLabelDocument('CBGC', [{ ...item, item_name: '<script>alert(1)</script>', management_no: 'A"B' }], qr);
assert(escaped.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
assert(escaped.includes('A&quot;B'));
const base = { organization: 'CBGC', management_no: 'TEST', item_type: 'PC', item_name: '테스트' };
for (const item_type of [undefined, null, '', '   ']) {
  assert.equal(itemSchema.parse({ ...base, item_type }).item_type, '');
}
assert.equal(itemSchema.parse({ ...base, item_type: '  PC  ' }).item_type, 'PC');
const minimum = { organization: 'CBGC', management_no: 'TEST' };
const normalized = itemSchema.parse(minimum);
assert.equal(normalized.item_name, '');
assert.equal(normalized.item_type, '');
assert.equal(normalized.purchase_price, null);
for (const price of [0, '0', ' 0 ']) {
  assert.equal(itemSchema.parse({ ...minimum, purchase_price: price }).purchase_price, 0);
}
for (const [input, expected] of [
  ['-', '-'], [' 미상 ', '미상'], ['수리비 포함', '수리비 포함'], ['1,500.75', 1500.75],
  ['-12.5', -12.5], ['1e-7', 1e-7], ['12,34', '12,34'],
  ['9223372036854775807', '9223372036854775807'],
  ['0.1234567890123456789', '0.1234567890123456789'],
]) {
  assert.equal(itemSchema.parse({ ...minimum, purchase_price: input }).purchase_price, expected);
}
for (const empty of [undefined, null, '', '  ']) {
  const parsed = itemSchema.parse({ ...minimum, item_name: empty, purchase_price: empty });
  assert.equal(parsed.item_name, '');
  assert.equal(parsed.purchase_price, null);
  assert.equal(itemSchema.safeParse({ ...minimum, management_no: empty }).success, false);
}
assert.equal(itemSchema.parse(base).quantity, null);
assert.equal(itemSchema.parse({ ...base, quantity: 0 }).quantity, 0);
assert.equal(itemSchema.parse({ ...base, quantity: '1,500' }).quantity, 1500);
assert.equal(itemSchema.parse({ ...base, quantity: '' }).quantity, null);
assert.equal(itemSchema.safeParse({ ...base, quantity: -1 }).success, false);
assert.equal(itemSchema.parse({ ...base, quantity: 1.2 }).quantity, '1.2');
assert.equal(itemSchema.parse({ ...base, quantity: '확인 중' }).quantity, '확인 중');
assert.equal(itemSchema.safeParse({ ...base, quantity: '12,34' }).success, false);
assert.equal(itemSchema.safeParse({ ...base, acquired_date: '2026-02-30' }).success, false);
assert.equal(itemSchema.parse({ ...base, acquired_date: '2024. 2. 29.' }).acquired_date, '2024-02-29');
assert.equal(itemSchema.parse({ ...base, acquired_date: '2026년경' }).acquired_date, '2026년경');
assert.equal(itemSchema.parse({ ...base, useful_life_years: '-' }).useful_life_years, '-');
assert.equal(itemSchema.parse({ ...base, photo_url: '사진 미등록' }).photo_url, '사진 미등록');
for (const url of ['javascript:alert(1)', 'https://user:pass@example.com/x', '//example.com/x'])
  assert.equal(itemSchema.safeParse({ ...base, photo_url: url }).success, false);
console.log('QR print regression checks passed (10 fields, escaping, blank/zero, pagination through 1,500 items, quantity validation).');
