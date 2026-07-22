import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { analyzeReachability } from './check-web-tsx-reachability.mjs';

function fixture(files, config = null) {
  const projectRoot = mkdtempSync('/tmp/kessho-reachability-');
  const sourceDirectory = join(projectRoot, 'src');
  for (const [name, source] of Object.entries(files)) {
    const path = join(projectRoot, name);
    mkdirSync(resolve(path, '..'), { recursive: true });
    writeFileSync(path, source);
  }
  if (config) writeFileSync(join(projectRoot, 'tsconfig.json'), JSON.stringify(config));
  return {
    projectRoot,
    sourceDirectory,
    dispose: () => rmSync(projectRoot, { recursive: true, force: true }),
  };
}

function analyze(files, groups, config = null, allowedDisconnected = new Set()) {
  const testFixture = fixture(files, config);
  try {
    return analyzeReachability({
      projectRoot: testFixture.projectRoot,
      sourceDirectory: testFixture.sourceDirectory,
      groups,
      allowedDisconnected,
    });
  } finally {
    testFixture.dispose();
  }
}

test('reports an internally connected tree that is disconnected from entries', () => {
  const result = analyze(
    {
      'src/main.ts': "import './connected';\n",
      'src/connected.ts': 'export const connected = true;\n',
      'src/dead.ts': "import './dead-child';\n",
      'src/dead-child.ts': 'export const dead = true;\n',
    },
    { production: ['src/main.ts'], workers: [], platform: [] },
  );
  assert.deepEqual(result.unexpectedDisconnected, ['src/dead-child.ts', 'src/dead.ts']);
  assert.equal(result.runtimeReachable.size, 2);
});

test('follows reachable TypeScript, dynamic imports, and path aliases', () => {
  const result = analyze(
    {
      'src/main.ts': "import '@shared/module'; void import('./dynamic');\n",
      'src/shared/module.ts': 'export const shared = true;\n',
      'src/dynamic.ts': 'export const dynamic = true;\n',
    },
    { production: ['src/main.ts'], workers: [], platform: [] },
    { compilerOptions: { baseUrl: '.', paths: { '@shared/*': ['src/shared/*'] } } },
  );
  assert.deepEqual(result.unexpectedDisconnected, []);
  assert.equal(result.runtimeReachable.size, 3);
});

test('declared worker entries are runtime-reachable', () => {
  const result = analyze(
    {
      'src/main.ts': 'export const main = true;\n',
      'src/export.worker.ts': "import './worker-helper';\n",
      'src/worker-helper.ts': 'export const helper = true;\n',
    },
    { production: ['src/main.ts'], workers: ['src/export.worker.ts'], platform: [] },
  );
  assert.deepEqual(result.unexpectedDisconnected, []);
  assert.equal(result.runtimeReachable.size, 3);
});

test('test-only helpers are classified as test support, not production', () => {
  const result = analyze(
    {
      'src/main.ts': 'export const main = true;\n',
      'src/support/referenceHelper.ts': 'export const helper = true;\n',
      'src/support/referenceHelper.test.ts': "import './referenceHelper';\n",
    },
    { production: ['src/main.ts'], workers: [], platform: [] },
  );
  assert.deepEqual(result.unexpectedDisconnected, []);
  assert.deepEqual(result.testOnly, ['src/support/referenceHelper.ts']);
});

test('stale disconnected-module allowlist entries are reported', () => {
  const result = analyze(
    { 'src/main.ts': 'export const main = true;\n' },
    { production: ['src/main.ts'], workers: [], platform: [] },
    null,
    new Set(['src/stale.ts']),
  );
  assert.deepEqual(result.staleAllowlist, ['src/stale.ts']);
});

test('comments and ordinary strings are not treated as imports', () => {
  const result = analyze(
    {
      'src/main.ts': "// import './comment-only';\nconst text = \"import './string-only'\";\nexport { text };\n",
    },
    { production: ['src/main.ts'], workers: [], platform: [] },
  );
  assert.deepEqual(result.unexpectedDisconnected, []);
  assert.equal(result.runtimeReachable.size, 1);
});
