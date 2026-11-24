import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
function transpile(source, fileName) {
  const result = ts.transpileModule(source, {
    fileName,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    reportDiagnostics: true,
  });
  assert.equal(result.diagnostics.length, 0, fileName + ' parses');
  return result.outputText;
}
function loadSelection() {
  const module = { exports: {} };
  new Function('module', 'exports', transpile(read('lib/item-selection.ts'), 'item-selection.ts'))(module, module.exports);
  return module.exports.updateItemSelection;
}
const updateItemSelection = loadSelection();
const sorted = ids => [...ids].sort();
function expectSelection(result, expected, message) {
  assert.deepEqual(sorted(result), sorted(expected), message);
}
function apply(selected, visible, clicked, anchor, expected, message) {
  const input = new Set(selected);
  const beforeIds = [...input];
  const beforeVisible = [...visible];
  const result = updateItemSelection(input, visible, clicked, anchor);
  expectSelection(result, expected, message);
  assert.notEqual(result, input, message + ': returns a new Set');
  assert.deepEqual([...input], beforeIds, message + ': input Set unchanged');
  assert.deepEqual(visible, beforeVisible, message + ': visible order unchanged');
}

const visible = ['A', 'B', 'C', 'D', 'E', 'F'];
apply([], visible, 'C', null, ['C'], 'Ordinary click selects one row');
apply(['A', 'C'], visible, 'C', null, ['A'], 'Ordinary click deselects only that row');
apply(['F'], visible, 'D', 'B', ['B', 'C', 'D', 'F'], 'Forward range includes both endpoints and preserves other selections');
apply(['F'], visible, 'B', 'D', ['B', 'C', 'D', 'F'], 'Backward range includes both endpoints');
apply(['B', 'D'], visible, 'D', 'B', ['B', 'C', 'D'], 'Shift-clicking an already selected endpoint does not toggle it off');
apply(['C', 'F'], visible, 'C', 'C', ['C', 'F'], 'Shift-clicking the anchor keeps it selected');
apply([], ['E', 'B', 'D', 'A', 'F'], 'A', 'B', ['B', 'D', 'A'], 'Range follows the visible sort order');
apply([], ['A', 'C', 'F'], 'F', 'A', ['A', 'C', 'F'], 'Filtered-out rows are not added to the range');
apply(['E'], visible, 'C', 'missing', ['C', 'E'], 'Missing anchor falls back to ordinary selection');
apply(['C', 'E'], visible, 'C', 'missing', ['E'], 'Missing anchor can ordinarily deselect');
apply(['A', 'D'], visible, 'missing', 'A', ['A', 'D'], 'A non-visible clicked ID is ignored');
apply(['A'], [], 'A', null, ['A'], 'An empty visible list does not change existing selection');
const large = Array.from({ length: 1500 }, (_, index) => `item-${index}`);
apply([], large, large[1499], large[0], large, 'All 1,500 visible rows can be selected');
apply([], large, large[0], large[1499], large, 'All 1,500 visible rows can be selected in reverse');

// Extract the production event handlers instead of reimplementing their anchor logic.
const adminSource = read('components/AdminConsole.tsx');
const ast = ts.createSourceFile('AdminConsole.tsx', adminSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const admin = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'AdminConsole');
assert(admin?.body, 'AdminConsole exists');
const handlers = ['toggleSelected', 'toggleAllVisible'].map(name => {
  const node = admin.body.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
  assert(node, name + ' exists');
  return node.getText(ast);
}).join('\n');
const contextVariable = admin.body.statements.flatMap(statement => ts.isVariableStatement(statement) ? [...statement.declarationList.declarations] : [])
  .find(node => ts.isIdentifier(node.name) && node.name.text === 'selectionContext');
assert(contextVariable?.initializer, 'Selection context exists');
const contextFields = ['org', 'section', 'search', 'type', 'expiredOnly', 'sortKey', 'sortDirection'];
const contextFrom = new Function(...contextFields, `return ${contextVariable.initializer.getText(ast)};`);
const contextEffect = admin.body.statements
  .filter(ts.isExpressionStatement).map(node => node.expression)
  .filter(node => ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'useEffect')
  .find(node => ts.isArrayLiteralExpression(node.arguments[1]) && node.arguments[1].elements.length === 1
    && ts.isIdentifier(node.arguments[1].elements[0]) && node.arguments[1].elements[0].text === 'selectionContext');
assert(contextEffect?.arguments[0], 'Context change effect exists');
const source = `
  let sortedItems = initialIds.map(id => ({ id }));
  let selectedIds = new Set();
  let selectionContext = initialContext;
  const selectionAnchor = { current: null };
  function setSelectedIds(value) {
    const before = [...selectedIds];
    const next = typeof value === 'function' ? value(selectedIds) : value;
    if (typeof value === 'function') {
      const replay = value(selectedIds);
      assert.deepEqual([...replay], [...next], 'React updater replay is deterministic');
      assert.deepEqual([...selectedIds], before, 'React updater keeps its input immutable');
    }
    selectedIds = next;
  }
  ${handlers}
  const runContextEffect = ${contextEffect.arguments[0].getText(ast)};
  return {
    click: toggleSelected,
    all: toggleAllVisible,
    snapshot: () => ({ ids: [...selectedIds], anchor: selectionAnchor.current && { ...selectionAnchor.current } }),
    view: ids => { sortedItems = ids.map(id => ({ id })); },
    context: (next, flush = true) => {
      if (next !== selectionContext) {
        selectionContext = next;
        if (flush) runContextEffect();
      }
    },
  };
`;
const makeHarness = new Function('initialIds', 'initialContext', 'updateItemSelection', 'assert', transpile(source, 'selection-harness.ts'));
const initialValues = ['CBGC', 'items', '', '', false, 'default', 'asc'];
const initialContext = contextFrom(...initialValues);
function harness(ids = visible) { return makeHarness(ids, initialContext, updateItemSelection, assert); }

let view = harness();
view.click('B', false);
view.click('D', true);
expectSelection(view.snapshot().ids, ['B', 'C', 'D'], 'Production handler selects a range');
assert.equal(view.snapshot().anchor.id, 'B');
view.click('F', true);
expectSelection(view.snapshot().ids, ['B', 'C', 'D', 'E', 'F'], 'Repeated Shift extends from the original anchor');
assert.equal(view.snapshot().anchor.id, 'B', 'Repeated Shift keeps the original anchor');
view.click('A', true);
expectSelection(view.snapshot().ids, visible, 'Repeated Shift can extend in the other direction');
assert.equal(view.snapshot().anchor.id, 'B');
view.click('E', false);
assert.equal(view.snapshot().anchor.id, 'E', 'Ordinary click establishes the next anchor even when deselecting');
expectSelection(view.snapshot().ids, ['A', 'B', 'C', 'D', 'F']);
view.click('F', true);
expectSelection(view.snapshot().ids, visible, 'A range from the new anchor reselects its endpoints');
const untouched = view.snapshot();
view.click('hidden', false);
assert.deepEqual(view.snapshot(), untouched, 'Missing clicked ID changes neither selection nor anchor');

view = harness();
view.click('B', false);
view.view(['F', 'D', 'C']);
view.click('C', true);
expectSelection(view.snapshot().ids, ['B', 'C'], 'An anchor filtered out of the view cannot select a hidden range');
assert.equal(view.snapshot().anchor.id, 'C');

for (const [index, nextValue] of [[0, 'CBCKL'], [1, 'dashboard'], [2, '검색'], [3, '비품'], [4, true], [5, 'management_no'], [6, 'desc']]) {
  const values = [...initialValues]; values[index] = nextValue;
  const nextContext = contextFrom(...values);
  assert.notEqual(nextContext, initialContext, `${contextFields[index]} changes the selection context`);
  view = harness();
  view.click('B', false);
  view.context(nextContext, false); // React effect has not run yet.
  view.click('F', true);
  expectSelection(view.snapshot().ids, ['B', 'F'], 'Stale context rejects an earlier anchor: ' + contextFields[index]);
  assert.deepEqual(view.snapshot().anchor, { id: 'F', context: nextContext });
  view = harness();
  view.click('B', false);
  view.context(nextContext);
  assert.equal(view.snapshot().anchor, null, 'Flushed context effect resets the anchor: ' + contextFields[index]);
}

for (const checked of [false, true]) {
  view = harness(['F', 'D', 'A']);
  view.click('D', false);
  view.all(checked);
  assert.equal(view.snapshot().anchor, null, 'Whole-list toggle clears its range anchor');
  expectSelection(view.snapshot().ids, checked ? ['F', 'D', 'A'] : [], 'Whole-list selection uses only visible IDs');
  view.click('A', true);
  expectSelection(view.snapshot().ids, checked ? ['F', 'D'] : ['A'], 'First Shift after whole-list toggle behaves as one ordinary click');
  assert.equal(view.snapshot().anchor.id, 'A');
}

// Exercise the actual checkbox callback with mouse/keyboard native-event shapes.
let rowCallback;
function visit(node) {
  if (ts.isJsxAttribute(node) && node.name.getText(ast) === 'onChange'
    && ts.isJsxExpression(node.initializer) && node.initializer.expression?.getText(ast).includes('onToggleSelected')) {
    rowCallback = node.initializer.expression.getText(ast);
  }
  ts.forEachChild(node, visit);
}
visit(ast);
assert(rowCallback, 'Row selection callback exists');
const eventCalls = [];
const eventHandler = new Function('i', 'onToggleSelected', transpile(`return (${rowCallback});`, 'checkbox-handler.ts'))(
  { id: 'A' }, (...args) => eventCalls.push(args)
);
eventHandler({ nativeEvent: { shiftKey: true } });
eventHandler({ nativeEvent: { shiftKey: false } });
eventHandler({ nativeEvent: {} });
assert.deepEqual(eventCalls, [['A', true], ['A', false], ['A', false]], 'Checkbox forwards Shift and safely handles events without the modifier');
console.log('Item selection tests passed: inclusive bidirectional ranges, 1,500 rows, visible order/filter scope, immutable state, actual AdminConsole anchors/context resets, whole-list selection, and checkbox Shift forwarding.');
