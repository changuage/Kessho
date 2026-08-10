#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const generator = path.join(root, 'scripts/generate-pad-synth-tables.mjs');
const result = spawnSync(process.execPath, [generator, '--check'], { cwd: root, encoding: 'utf8' });
if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout || 'Pad synth table generator check failed\n');
  process.exit(result.status || 1);
}

const header = fs.readFileSync(path.join(root, 'wasm/pad/generated/pad_synth_tables.generated.h'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'src/ui/synth/generated/padSynthPreviewTables.generated.ts'), 'utf8');
for (const [label, text, required] of [
  ['audio header', header, ['kTrajectoryCount = 3', 'kPositionFrames = 32', 'kMipLevels = 8', 'kAudioSamples = 257', 'kFoldAmountFrames = 33']],
  ['UI preview', ui, ['PAD_PREVIEW_POSITION_FRAMES = 32', 'PAD_PREVIEW_SAMPLES = 129', 'PAD_PREVIEW_FOLD_SAMPLES = 65']],
]) {
  for (const token of required) {
    if (!text.includes(token)) {
      console.error(`${label} is missing ${token}`);
      process.exit(1);
    }
  }
}
console.log('Pad synth generated tables are current, finite, guarded, and within decoded memory budgets.');
