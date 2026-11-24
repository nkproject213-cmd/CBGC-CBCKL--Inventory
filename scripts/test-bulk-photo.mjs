import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
function load(file, stubs = {}) {
  const output = ts.transpileModule(read(file), {
    fileName: file,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    reportDiagnostics: true,
  });
  assert.equal(output.diagnostics.length, 0, file + ' parses');
  const module = { exports: {} };
  new Function('require', 'module', 'exports', output.outputText)(
    name => Object.hasOwn(stubs, name) ? stubs[name] : require(name), module, module.exports
  );
  return module.exports;
}
class NextResponse extends Response {
  static json(value, init) {
    return new NextResponse(JSON.stringify(value), {
      ...init, headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
  }
}

const flexible = load('lib/flexible-fields.ts');
const purchase = load('lib/purchase-price.ts');
const shared = load('lib/shared-photo.ts', { './flexible-fields': flexible });
const validation = load('lib/validation.ts', {
  './flexible-fields': flexible, './purchase-price': purchase,
});
const photo = 'https://test-store.public.blob.vercel-storage.com/inventory/shared/photo-1.webp';
const otherPhoto = 'https://test-store.public.blob.vercel-storage.com/inventory/shared/photo-2.webp';
const singlePhoto = 'https://test-store.public.blob.vercel-storage.com/inventory/single.webp';
const firstId = 'aaaaaaaa-0000-4000-8000-000000000001';
const secondId = 'aaaaaaaa-0000-4000-8000-000000000002';
assert.equal(shared.isSharedPhotoUrl(photo), true);
for (const invalid of [null, '', '-', 'not a URL', singlePhoto,
  'https://evil.example/inventory/shared/photo.webp',
  'https://test-store.public.blob.vercel-storage.com.evil.example/inventory/shared/photo.webp',
  'https://user@store.public.blob.vercel-storage.com/inventory/shared/photo.webp',
  'https://store.public.blob.vercel-storage.com/inventory/shared/',
  'https://store.public.blob.vercel-storage.com/inventory/shared/%zz.webp']) {
  assert.equal(shared.isSharedPhotoUrl(invalid), false, String(invalid));
}

let admin = false;
let databaseCalls = [];
let result = { total: 2, updated: 2, unchanged: 0 };
const route = load('app/api/items/bulk-photo/route.ts', {
  'next/server': { NextResponse },
  '@/lib/auth': { isAdmin: async () => admin },
  '@/lib/shared-photo': shared,
  '@/lib/validation': validation,
  '@/lib/db': { updatePhotoForItems: async (...args) => { databaseCalls.push(args); return result; } },
});
const payload = { organization: 'CBGC', ids: [firstId, secondId], photo_url: photo };
const request = body => new Request('https://test.invalid/api/items/bulk-photo', {
  method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
assert.equal((await route.PATCH(request(payload))).status, 401);
assert.equal(databaseCalls.length, 0, 'Unauthenticated requests cannot touch data');
admin = true;
const malformed = new Request('https://test.invalid/api/items/bulk-photo', { method: 'PATCH', body: '{' });
assert.equal((await route.PATCH(malformed)).status, 400);
for (const body of [
  { ...payload, organization: 'OTHER' },
  { ...payload, ids: [] },
  { ...payload, ids: ['not-a-uuid'] },
  { ...payload, ids: [null] },
  { ...payload, photo_url: singlePhoto },
  { ...payload, photo_url: 'https://evil.example/inventory/shared/photo.webp' },
  { ...payload, ids: Array.from({ length: 2001 }, (_, i) => `aaaaaaaa-0000-4000-8000-${String(i).padStart(12, '0')}`) },
]) assert.equal((await route.PATCH(request(body))).status, 400);
assert.equal(databaseCalls.length, 0, 'Invalid requests cannot touch data');

let response = await route.PATCH(request({
  organization: ' cbgc ', ids: [firstId.toUpperCase(), firstId, secondId], photo_url: ' ' + photo + ' ',
}));
assert.equal(response.status, 200);
assert.deepEqual(await response.json(), result);
assert.equal(response.headers.get('cache-control'), 'private, no-store');
assert.deepEqual(databaseCalls.at(-1), ['CBGC', [firstId, secondId], photo], 'Case/whitespace normalize before deduplication');
result = { total: 2, updated: 0, unchanged: 2 };
response = await route.PATCH(request({ ...payload, organization: 'cbckl' }));
assert.equal(response.status, 200);
assert.deepEqual(await response.json(), result);
assert.equal(databaseCalls.at(-1)[0], 'CBCKL');
result = null;
response = await route.PATCH(request(payload));
assert.equal(response.status, 409, 'Missing/moved targets are reported as one rejected batch');

// Real item routes must preserve the shared blob when only one reference changes.
let currentPhoto = photo;
const deletedBlobs = [];
const itemRoutes = load('app/api/items/[id]/route.ts', {
  'next/server': { NextResponse },
  '@vercel/blob': { del: async url => { deletedBlobs.push(url); } },
  '@/lib/auth': { isAdmin: async () => true },
  '@/lib/validation': validation,
  '@/lib/shared-photo': shared,
  '@/lib/db': {
    getItem: async () => ({ organization: 'CBGC', management_no: 'A-1', photo_url: currentPhoto }),
    updateItem: async (id, value) => ({ id, ...value, photo_url_text: null }),
    deleteItem: async () => ({ id: firstId, photo_url: currentPhoto }),
  },
});
const context = { params: Promise.resolve({ id: firstId }) };
assert.equal((await itemRoutes.PATCH(request({ photo_url: otherPhoto }), context)).status, 200);
assert.equal((await itemRoutes.DELETE(request({}), context)).status, 200);
assert.deepEqual(deletedBlobs, [], 'Shared photo survives single-item replacement and deletion');
currentPhoto = singlePhoto;
assert.equal((await itemRoutes.PATCH(request({ photo_url: otherPhoto }), context)).status, 200);
assert.equal((await itemRoutes.DELETE(request({}), context)).status, 200);
assert.deepEqual(deletedBlobs, [singlePhoto, singlePhoto], 'Existing unshared photo cleanup continues');

console.log('Bulk photo regression tests passed: authorization, input validation, 2,000-item cap, case-insensitive UUID deduplication, organization routing, conflict response, and shared-file survival.');
