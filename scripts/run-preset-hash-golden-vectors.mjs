#!/usr/bin/env node
import { build } from 'esbuild';
import { webcrypto } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const tempDir = await mkdtemp(path.join(tmpdir(), 'preset-hash-golden-vectors-'));
const nodeOutfile = path.join(tempDir, 'preset-hash-golden-vectors.node.mjs');
const browserEntry = path.join(tempDir, 'preset-hash-golden-vectors.browser-entry.js');
const browserOutfile = path.join(tempDir, 'preset-hash-golden-vectors.browser.js');
const browserHtml = path.join(tempDir, 'preset-hash-golden-vectors.html');

if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

try {
  await build({
    entryPoints: ['src/presets/presetHashGoldenVectors.test.ts'],
    outfile: nodeOutfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    sourcemap: 'inline',
    logLevel: 'silent',
  });
  const nodeModule = await import(pathToFileURL(nodeOutfile).href);
  await nodeModule.runPresetHashGoldenVectors();

  const testModulePath = path.resolve('src/presets/presetHashGoldenVectors.test.ts');
  await writeFile(
    browserEntry,
    [
      `import { runPresetHashGoldenVectors } from ${JSON.stringify(testModulePath)};`,
      '(async () => {',
      '  try {',
      '    await runPresetHashGoldenVectors();',
      '    window.__presetHashGoldenVectorResult = { ok: true };',
      '  } catch (error) {',
      '    window.__presetHashGoldenVectorResult = { ok: false, message: String(error?.stack || error?.message || error) };',
      '  }',
      '})();',
      '',
    ].join('\n'),
    'utf8',
  );
  await build({
    entryPoints: [browserEntry],
    outfile: browserOutfile,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    sourcemap: 'inline',
    logLevel: 'silent',
  });
  await writeFile(
    browserHtml,
    [
      '<!doctype html>',
      '<meta charset="utf-8">',
      '<script src="./preset-hash-golden-vectors.browser.js"></script>',
      '',
    ].join('\n'),
    'utf8',
  );

  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(browserHtml).href);
    const result = await page.waitForFunction(() => window.__presetHashGoldenVectorResult, null, { timeout: 10_000 })
      .then((handle) => handle.jsonValue());
    if (!result?.ok) {
      throw new Error(`Browser preset hash golden vectors failed: ${result?.message ?? 'unknown error'}`);
    }
  } finally {
    await browser.close();
  }

  console.log('Preset hash golden vectors passed in Node and browser.');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
