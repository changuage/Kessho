import { existsSync, readFileSync } from 'node:fs';

const failures = [];
const read = (path) => readFileSync(path, 'utf8');
const assert = (condition, message) => { if (!condition) failures.push(message); };

const retired = [
  'src/ui/useProductRuntimeLiveTriggerCallbacks.ts',
  'src/ui/useProductRuntimeVisualizerCallbacks.ts',
  'src/ui/useSelectedAudioEngineLiveTriggerCallbacks.ts',
  'src/ui/useSelectedAudioEngineRuntimeCallbackRegistrations.ts',
  'src/ui/useProductRuntimeSequencerCallbacks.ts',
  'src/ui/useSelectedAudioEngineSequencerCallbacks.ts',
];
for (const path of retired) assert(!existsSync(path), `${path} must remain retired`);

const projection = read('src/ui/useRuntimeSequencerProjectionCallbacks.ts');
const productSurface = read('src/ui/useProductRuntimeCallbackSurfaces.ts');
const registrations = read('src/ui/useProductRuntimeCallbackRegistrations.ts');

for (const token of [
  'productEngine.setDrumStepPositionCallback(callback)',
  'productEngine.setDrumEuclidEvolveTriggerCallback(callback)',
  'productEngine.setDrumTriggerCallback(',
  'productEngine.setSynthStepPositionCallback(callback)',
  'productEngine.setSynthOrbitVisualStateCallback(callback)',
  'productEngine.setSynthAnchorWalkerVisualStateCallback(callback)',
  'productEngine.setSynthEuclidEvolveTriggerCallback(callback)',
]) assert(projection.includes(token), `canonical sequencer projection hook missing ${token}`);

for (const forbidden of [
  'enqueueEvents',
  'commitLiveSequencerTiming',
  'setInterval',
  'requestAnimationFrame',
  'AudioContext',
  'primeAudioContext',
  'resumeQuant',
  'visibilitychange',
]) assert(!projection.includes(forbidden), `projection hook must not own timing/lifecycle behavior: ${forbidden}`);

assert(productSurface.includes('useRuntimeSequencerProjectionCallbacks()'), 'product surface must consume canonical sequencer projections');
assert(registrations.includes('useLiveTriggerUiCallbacks({'), 'live runtime projections must use the neutral shared implementation');
assert(productSurface.includes('useRuntimeSequencerProjectionCallbacks()'), 'Product surface must consume canonical sequencer projections');

if (failures.length > 0) {
  console.error(`Runtime projection unification check failed:\n${failures.map((failure) => `- ${failure}`).join('\n')}`);
  process.exit(1);
}

console.log('Runtime projection unification check passed');
