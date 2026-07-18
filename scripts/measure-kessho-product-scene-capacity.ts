import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createCoreProductSnapshot } from '../src/audio/coreProductSnapshot';
import type { CoreProductSnapshot } from '../src/audio/coreProductSnapshotTypes';
import { compileProductSceneProgram } from '../src/audio/product/scene/compileProductSceneProgram';
import { DEFAULT_STATE, MOBILE_STATE } from '../src/ui/state';

const hardEntryCap = 1024;
const hardCommandCap = 512;

function nextPowerOfTwo(value: number): number {
  let result = 1;
  while (result < value) result *= 2;
  return result;
}

function clone(snapshot: CoreProductSnapshot): CoreProductSnapshot {
  return structuredClone(snapshot);
}

function maximumControlFixture(base: CoreProductSnapshot): CoreProductSnapshot {
  const snapshot = clone(base);
  snapshot.transport.bpm = 137;
  snapshot.transport.swing = 0.31;
  snapshot.harmony.rootMidi = 67;
  snapshot.harmony.scaleId = 5;
  snapshot.harmony.tension = 0.83;
  snapshot.journey.enabled = true;
  snapshot.journey.morphPhase = 0.72;
  snapshot.journey.morphRateBars = 8;
  snapshot.master.gain = 0.63;
  snapshot.master.limiterCeilingDb = -1.7;
  snapshot.evolution.amount = 0.71;
  snapshot.evolution.state = 19;
  for (const [index, source] of snapshot.sources.entries()) {
    source.enabled = index % 2 === 0;
    source.level = 0.2 + index * 0.07;
    source.morph = 0.1 + index * 0.08;
    source.distance = 0.8 - index * 0.06;
    source.expression = 0.35 + index * 0.05;
    source.dryGain = 0.6 + index * 0.03;
    source.reverbSend = 0.12 + index * 0.04;
    source.delayASend = 0.08 + index * 0.03;
    source.delayBSend = 0.06 + index * 0.02;
    source.granularSend = 0.04 + index * 0.025;
    source.diffuseSend = 0.03 + index * 0.02;
    source.postLpfHz = 3200 + index * 1400;
    source.stereoWidth = 0.4 + index * 0.06;
    source.attackSeconds = 0.01 + index * 0.02;
    source.releaseSeconds = 0.2 + index * 0.12;
  }
  for (const lanes of [snapshot.synthLanes, snapshot.drumLanes]) {
    for (const [index, lane] of lanes.entries()) {
      lane.enabled = index % 2 === 0;
      lane.targetSourceId = lanes === snapshot.synthLanes ? 1 + index % 4 : 5;
      lane.stepCount = 8 + index;
      lane.fillCount = 3 + index % 5;
      lane.rotation = index;
      lane.clockDivision = index % 2 === 0 ? 8 : 16;
      lane.swing = 0.05 * index;
      lane.probability = 0.55 + index * 0.04;
      lane.ratchet = 1 + index % 3;
      lane.midiNote = 48 + index * 3;
      lane.velocity = 0.45 + index * 0.04;
      lane.holdSeconds = 0.04 + index * 0.02;
      lane.morph = 0.1 * index;
      lane.distance = 0.8 - 0.07 * index;
      lane.expression = 0.5 + 0.04 * index;
      lane.seed = 1000 + index;
    }
  }
  const mutateBlock = (value: unknown, depth = 0): void => {
    if (!value || typeof value !== 'object' || depth > 4) return;
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (typeof child === 'boolean') {
        (value as Record<string, unknown>)[key] = !child;
      } else if (typeof child === 'number' && Number.isFinite(child)) {
        (value as Record<string, unknown>)[key] = child === 0 ? 0.17 : child * 0.83;
      } else if (!Array.isArray(child)) {
        mutateBlock(child, depth + 1);
      }
    }
  };
  mutateBlock(snapshot.fx);
  mutateBlock(snapshot.routing);
  return snapshot;
}

const defaultSnapshot = createCoreProductSnapshot(DEFAULT_STATE);
const mobileSnapshot = createCoreProductSnapshot(MOBILE_STATE);
const sampleHeavy = createCoreProductSnapshot({
  ...DEFAULT_STATE,
  sample1Enabled: true,
  sample1LibraryKey: 'piano',
  sample1DynamicMode: 'velocity',
  sample2Enabled: true,
  sample2LibraryKey: 'soft-string-spurs',
  sample2DynamicMode: 'fixed',
});
const soundscapeHeavy = clone(defaultSnapshot);
soundscapeHeavy.assetRefs = [7101, 7102, 7103, 7104, 7105, 7106];
soundscapeHeavy.assetRefLevels = [0.8, 0.6, 0.55, 0.7, 0.5, 0.65];
soundscapeHeavy.soundscape.textureParamCount = soundscapeHeavy.soundscape.textureParams.length;
soundscapeHeavy.soundscape.textureParams = soundscapeHeavy.soundscape.textureParams.map((value, index) => value + (index % 5) * 0.03);
soundscapeHeavy.soundscape.moduleParamCount = soundscapeHeavy.soundscape.moduleParams.length;
soundscapeHeavy.soundscape.moduleParams = soundscapeHeavy.soundscape.moduleParams.map((value, index) =>
  index === 0 || index === 61 || index === 78 ? 1 : value + (index % 7) * 0.02);
const maximumControl = maximumControlFixture(defaultSnapshot);

const corpus = [
  ['default-to-mobile', defaultSnapshot, mobileSnapshot],
  ['maximum-cpu', defaultSnapshot, maximumControl],
  ['maximum-memory', defaultSnapshot, soundscapeHeavy],
  ['sample-heavy', defaultSnapshot, sampleHeavy],
  ['soundscape-heavy', mobileSnapshot, soundscapeHeavy],
  ['auto-cycle-production', sampleHeavy, maximumControl],
  ['journey-production', soundscapeHeavy, maximumControl],
  ['maximum-control', defaultSnapshot, maximumControl],
] as const;

let observedEntries = 0;
let observedCommands = 0;
for (const [label, a, b] of corpus) {
  const program = compileProductSceneProgram(a, b);
  if (program.unsupportedKeys.length > 0) {
    throw new Error(`${label} scene fixture has unsupported fields: ${program.unsupportedKeys.join(', ')}`);
  }
  observedEntries = Math.max(observedEntries, program.entries.length);
  observedCommands = Math.max(observedCommands, program.boundaryCommands.length);
}

const entryCapacity = nextPowerOfTwo(Math.ceil(observedEntries * 1.25));
const commandCapacity = nextPowerOfTwo(Math.ceil(observedCommands * 1.25));
if (entryCapacity > hardEntryCap) throw new Error(`Measured Product scene entry capacity ${entryCapacity} exceeds hard cap ${hardEntryCap}`);
if (commandCapacity > hardCommandCap) throw new Error(`Measured Product scene command capacity ${commandCapacity} exceeds hard cap ${hardCommandCap}`);

const root = process.cwd();
const cpp = `// Generated by scripts/measure-kessho-product-scene-capacity.ts. Do not edit.\n#pragma once\n\n#include <cstdint>\n\nnamespace kessho::product::generated {\ninline constexpr uint32_t KESSHO_PRODUCT_SCENE_MAX_ENTRIES = ${entryCapacity}u;\ninline constexpr uint32_t KESSHO_PRODUCT_SCENE_MAX_COMMANDS = ${commandCapacity}u;\ninline constexpr uint32_t KESSHO_PRODUCT_SCENE_OBSERVED_ENTRIES = ${observedEntries}u;\ninline constexpr uint32_t KESSHO_PRODUCT_SCENE_OBSERVED_COMMANDS = ${observedCommands}u;\n}\n`;
const ts = `// Generated by scripts/measure-kessho-product-scene-capacity.ts. Do not edit.\nexport const KESSHO_PRODUCT_SCENE_MAX_ENTRIES = ${entryCapacity};\nexport const KESSHO_PRODUCT_SCENE_MAX_COMMANDS = ${commandCapacity};\nexport const KESSHO_PRODUCT_SCENE_OBSERVED_ENTRIES = ${observedEntries};\nexport const KESSHO_PRODUCT_SCENE_OBSERVED_COMMANDS = ${observedCommands};\n`;
writeFileSync(resolve(root, 'cpp/KesshoCore/generated/KesshoProductSceneCapacities.h'), cpp);
writeFileSync(resolve(root, 'src/audio/generated/kesshoProductSceneCapacities.ts'), ts);
console.log(`Measured Product scene capacity: ${observedEntries}/${entryCapacity} entries, ${observedCommands}/${commandCapacity} commands`);
