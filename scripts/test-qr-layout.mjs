import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = fs.readFileSync(new URL('../lib/qr-layout.ts', import.meta.url), 'utf8');
const result = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }, reportDiagnostics: true });
assert.equal(result.diagnostics?.length || 0, 0);
const module = { exports: {} };
new Function('require', 'module', 'exports', result.outputText)(require, module, module.exports);
const { defaultLayout, parseLayout, layoutIssues, boundBox, informationHtml, renderLayoutDocument, fieldValue, safeImageUrl, FIELD_KEYS } = module.exports;
assert.deepEqual(parseLayout(defaultLayout()), defaultLayout());
assert.deepEqual(FIELD_KEYS, ['item_name','management_no','specification','acquired_date','storage_location','manager_main','manager_sub']);
for (const mutate of [l=>l.info.x=2, l=>l.qr.width=12, l=>l.qr.height=19, l=>l.image.url='javascript:alert(1)', l=>l.info.order=['item_name'], l=>l.version=2, l=>l.qr.x=NaN, l=>l.info.fontSize=100, l=>l.info.order[6]='item_name']) {
  const layout = defaultLayout(); mutate(layout); assert.throws(()=>parseLayout(layout));
}
assert.equal(safeImageUrl('https://user:password@example.com/a.png'),null);
assert.equal(safeImageUrl('data:image/svg+xml,<svg/>'),null);
assert.equal(safeImageUrl('https://example.com/a.png'),'https://example.com/a.png');
const moved = boundBox('qr', { x: -100, y: 100, width: 23, height: 10 });
assert.equal(moved.width, moved.height);
assert(moved.x >= .5 && moved.y + moved.height <= 29.61);
const item = { public_id:'test-id', item_name:'테스트 물품', management_no:'CBGC-001', specification:'15인치', acquired_date:'2025-06-09', storage_location:'게임센터', manager_main:'홍길동', manager_sub:'김영희', photo_url:null };
assert.equal(fieldValue({...item, acquired_date: new Date('2025-06-09T00:00:00Z')},'acquired_date'),'2025-06-09');
assert.equal(fieldValue({...item, specification:null},'specification'),'-');
const qr = new Map([['test-id','<svg viewBox="0 0 10 10"></svg>']]);
for (const count of [0,1,27,28,54,1500]) {
  const html=renderLayoutDocument('CBGC',Array.from({length:count},()=>item),qr,defaultLayout());
  assert.equal((html.match(/<section class="sheet">/g)||[]).length,Math.ceil(count/27));
  assert.equal((html.match(/<article class="ql-label"/g)||[]).length,count);
  assert(html.includes('padding:11mm 0 0 8mm'));
  assert(html.includes('repeat(3,62.7mm)'));
  assert(html.includes('repeat(9,30.1mm)'));
}
const content = informationHtml({...item,item_name:'<img src=x onerror=alert(1)>'},defaultLayout());
assert(content.includes('&lt;img')); assert(!content.includes('<img'));
for(const removed of ['수량','단위','상태']) assert(!content.includes(removed));
const imageLayout = defaultLayout(); imageLayout.image.source='custom'; imageLayout.image.url='https://example.com/logo.png';
assert(renderLayoutDocument('CBGC',[item],qr,imageLayout).includes('https://example.com/logo.png'));
imageLayout.image.enabled=false;
assert(!renderLayoutDocument('CBGC',[item],qr,imageLayout).includes('<img'));
const reverse = defaultLayout(); reverse.info.order.reverse(); assert.deepEqual(parseLayout(reverse).info.order,reverse.info.order);
assert.equal(layoutIssues(defaultLayout()).length,0);
console.log('QR layout tests passed: three blocks, seven fields, bounds, overlap, safe images, escaping, 1,500-item pagination.');
