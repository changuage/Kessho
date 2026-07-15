#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

const failures = [];
function assert(condition, message) {
  if (!condition) failures.push(message);
}

const productManual = read('src/ui/useProductRuntimeManualTriggers.ts');
const productRegistrations = read('src/ui/useProductRuntimeCallbackRegistrations.ts');
const sharedLive = read('src/ui/useLiveTriggerUiCallbacks.ts');
const actions = read('src/product-control/ProductControlActions.ts');

const productTriggerFiles = [
  ['src/ui/useProductRuntimeManualTriggers.ts', productManual],
];

for (const [file, text] of productTriggerFiles) {
  assert(!text.includes('useSelectedAudioEngine'), `${file} must not import or call selected-runtime trigger hooks.`);
  assert(!text.includes('selectedProductRuntime'), `${file} must not call selectedProductRuntime.`);
  assert(!/\b(?:AudioContext|AudioNode|AnalyserNode|GainNode|AudioWorkletNode)\b/.test(text), `${file} must not expose browser Web Audio objects.`);
}

assert(
  productManual.includes("import { productEngine } from '../audio/product/ProductEngineProxy'") &&
    productManual.includes('commitProductControlActionThenTrigger') &&
    productManual.includes('(_revision, resolvedSliders) => productEngine.auditionSynthNote(productNote, resolvedSliders)') &&
    productManual.includes('const velocity = options.velocity ?? DEFAULT_MANUAL_DRUM_VELOCITY') &&
    productManual.includes('(_revision, resolvedSliders) => productEngine.triggerDrumVoice(voice, velocity, resolvedSliders)'),
  'Product manual triggers must commit Product Control state before calling productEngine trigger APIs.',
);
assert(
  productManual.includes("kind: 'synth-note'") &&
    productManual.includes('note,') &&
    productManual.includes("kind: 'drum-voice'") &&
    productManual.includes('voice,') &&
    productManual.includes('velocity,'),
  'Product manual triggers must include kind/note/voice/velocity metadata.',
);
assert(
  productRegistrations.includes('useLiveTriggerUiCallbacks({') &&
    productRegistrations.includes('setLeadExpressionCallback: setProductLeadExpressionCallback') &&
    productRegistrations.includes('setGranularSHTriggerCallback: setProductGranularSHTriggerCallback') &&
    !productRegistrations.includes('useSelectedAudioEngineLiveTriggerCallbacks'),
  'Product callback registration must use the runtime-neutral live projection hook.',
);
assert(
  sharedLive.includes('export function useLiveTriggerUiCallbacks') &&
    sharedLive.includes('mergeRuntimeTriggerPositions') &&
    sharedLive.includes('emitVisualizerPulse') &&
    !sharedLive.includes('selectedProductRuntime'),
  'Shared live trigger UI callback hook must be runtime-neutral.',
);
assert(
  actions.includes("export type ProductManualTriggerKind = 'synth-note' | 'drum-voice'") &&
    actions.includes('readonly kind?: ProductManualTriggerKind') &&
    actions.includes('readonly note?: ProductManualSynthNote') &&
    actions.includes('readonly voice?: ProductDrumVoice') &&
    actions.includes('readonly velocity?: number'),
  'ProductControlAction manual-trigger/request must preserve source and add optional trigger metadata.',
);

if (failures.length > 0) {
  console.error('Product trigger ownership audit failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Product trigger ownership audit passed.');
