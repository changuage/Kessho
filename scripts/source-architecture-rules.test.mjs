import assert from 'node:assert/strict';
import test from 'node:test';
import { collectImportSpecifiers, findForbiddenImports } from './lib/sourceArchitectureRules.mjs';

test('source architecture rules inspect static and dynamic imports without matching comments', () => {
  const source = `
    // import 'forbidden/comment-only';
    import type { SelectedProductRuntime } from 'forbidden/type-only';
    import { value } from 'forbidden/runtime';
    const lazy = () => import('forbidden/dynamic');
    const text = 'forbidden/string-only';
  `;
  const imports = collectImportSpecifiers('fixture.ts', source);
  assert.deepEqual(imports.map(entry => [entry.specifier, entry.kind, entry.isTypeOnly]), [
    ['forbidden/type-only', 'static', true],
    ['forbidden/runtime', 'static', false],
    ['forbidden/dynamic', 'dynamic', false],
  ]);
  assert.deepEqual(
    findForbiddenImports('fixture.ts', source, specifier => specifier.includes('forbidden'))
      .map(entry => entry.specifier),
    ['forbidden/runtime', 'forbidden/dynamic'],
  );
});
