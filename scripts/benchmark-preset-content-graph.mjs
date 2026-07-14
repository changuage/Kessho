#!/usr/bin/env node
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const directory = await mkdtemp(path.join(tmpdir(), 'preset-content-benchmark-'));
try {
  const outfile = path.join(directory, 'benchmark.mjs');
  await build({ entryPoints: ['src/presets/presetContentGraphBenchmark.ts'], outfile, bundle: true, platform: 'node', format: 'esm' });
  await import(pathToFileURL(outfile).href);
} finally {
  await rm(directory, { recursive: true, force: true });
}
