import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function loadTs(path) {
  const source = fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
  const result = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    reportDiagnostics: true,
  });
  assert.equal(result.diagnostics?.length || 0, 0, 'TypeScript parse errors in ' + path);
  const module = { exports: {} };
  new Function('require', 'module', 'exports', result.outputText)(require, module, module.exports);
  return module.exports;
}
const { labelFields, labelDate, renderQrLabelDocument } = loadTs('lib/qr-print.ts');
const { itemSchema } = loadTs('lib/validation.ts');
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
assert.equal(itemSchema.parse(base).quantity, null);
assert.equal(itemSchema.parse({ ...base, quantity: 0 }).quantity, 0);
assert.equal(itemSchema.parse({ ...base, quantity: '1,500' }).quantity, 1500);
assert.equal(itemSchema.parse({ ...base, quantity: '' }).quantity, null);
assert.equal(itemSchema.safeParse({ ...base, quantity: -1 }).success, false);
assert.equal(itemSchema.safeParse({ ...base, quantity: 1.2 }).success, false);
assert.equal(itemSchema.safeParse({ ...base, quantity: 'wrong' }).success, false);
console.log('QR print regression checks passed (10 fields, escaping, blank/zero, pagination through 1,500 items, quantity validation).');
