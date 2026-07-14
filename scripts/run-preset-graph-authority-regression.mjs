#!/usr/bin/env node
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const directory = await mkdtemp(path.join(tmpdir(), 'preset-graph-authority-'));
try {
  const outfile = path.join(directory, 'test.mjs');
  await build({ entryPoints: ['src/presets/presetGraphAuthority.test.ts'], outfile, bundle: true, platform: 'node', format: 'esm' });
  await import(pathToFileURL(outfile).href);
  console.log('preset graph authority regression passed');
} finally {
  await rm(directory, { recursive: true, force: true });
}
