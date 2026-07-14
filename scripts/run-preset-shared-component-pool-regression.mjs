#!/usr/bin/env node
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const directory = await mkdtemp(path.join(tmpdir(), 'preset-shared-pools-'));
try {
  const outfile = path.join(directory, 'test.mjs');
  await build({ entryPoints: ['src/presets/sharedComponentPools.test.ts'], outfile, bundle: true, platform: 'node', format: 'esm' });
  await import(pathToFileURL(outfile).href);
  console.log('preset shared component pool regression passed');
} finally {
  await rm(directory, { recursive: true, force: true });
}
