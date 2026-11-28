import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const grep = spawnSync(
  'git',
  [
    'grep',
    '-nE',
    'PRODUCT_VISIBLE_LANE_COUNT|drumVisibleLaneCount[^\\n]*4|DRUM_SEQUENCER_LANE_COUNT[^\\n]*= 4|DRUM_EUCLIDEAN_LANE_COUNT[^\\n]*= 4',
    '--',
    'src',
    'scripts',
    'cpp',
    ':!scripts/check-kessho-sequencer-lane-count-guards.mjs',
    ':!scripts/check-kessho-drum-sequencer-ui-lanes.mjs',
  ],
  {
    cwd: root,
    encoding: 'utf8',
  },
);

if (grep.status === 0 && grep.stdout.trim()) {
  console.error('Forbidden hard-coded drum 4-lane assumption found:\n');
  console.error(grep.stdout);
  process.exit(1);
}

if (grep.status !== 0 && grep.status !== 1) {
  console.error(grep.stderr || grep.stdout);
  process.exit(grep.status ?? 1);
}

const countsSource = readFileSync(join(root, 'src/audio/sequencerLaneCounts.ts'), 'utf8');
for (const required of [
  'SYNTH_EUCLIDEAN_LANE_COUNT = 6',
  'DRUM_EUCLIDEAN_LANE_COUNT = 6',
]) {
  if (!countsSource.includes(required)) {
    console.error(`Missing required sequencer lane-count declaration: ${required}`);
    process.exit(1);
  }
}

// Six uniform synth slots: native, TS state and the preset keys agree, and a
// Random slot is a slot type rather than a fixed lane.
const nativeState = readFileSync(join(root, 'cpp/KesshoCore/src/product/ProductState.h'), 'utf8');
if (!/uint32_t synth_lane_count = 6;/.test(nativeState)) {
  console.error('Native synth_lane_count must be 6 (ProductState.h)');
  process.exit(1);
}
const faceState = readFileSync(join(root, 'cpp/KesshoCore/src/product/ProductSequencerFaceState.h'), 'utf8');
if (!faceState.includes('kSequencerModeRandom = 3u')) {
  console.error('Native kSequencerModeRandom = 3u declaration is missing (ProductSequencerFaceState.h)');
  process.exit(1);
}
const slotTypes = readFileSync(join(root, 'src/ui/sequencer/sequencerModeTypes.ts'), 'utf8');
if (!slotTypes.includes("'euclid' | 'anchorWalker' | 'orbit' | 'random'")) {
  console.error('Slot types must be euclid | anchorWalker | orbit | random (sequencerModeTypes.ts)');
  process.exit(1);
}
const arrangementSnapshot = readFileSync(join(root, 'src/audio/coreProductArrangementSnapshot.ts'), 'utf8');
if (/TRANSITIONAL|coreProductRandomLanesFromState/.test(arrangementSnapshot)) {
  console.error('The fixed-lane Random builder must not return: Random lanes come from slots');
  process.exit(1);
}
const registry = readFileSync(join(root, 'src/presets/ParamRegistry.ts'), 'utf8');
if (!registry.includes('synthEuclid6VoiceMask') || !registry.includes('SYNTH_RANDOM_LANE_NUMBERS')) {
  console.error('ParamRegistry must cover six synth lanes and the per-slot Random keys');
  process.exit(1);
}

console.log('Sequencer lane-count guard passed');
