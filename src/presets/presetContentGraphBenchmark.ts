import { performance } from 'node:perf_hooks';
import { DEFAULT_STATE } from '../ui/state';
import { DRUM_EUCLIDEAN_LANE_COUNT, SYNTH_EUCLIDEAN_LANE_COUNT } from '../audio/sequencerLaneCounts';
import { preparePresetContentBatch, type PresetContentCandidate } from './contentNodes';
import { buildSequencerContentGroup, sequencerContentCandidates } from './sequencerContent';
import {
  buildDynamicsEqPoolInstance,
  buildGranularVoicePoolInstance,
  buildPadVoicePoolInstance,
  buildSampleVoicePoolInstance,
  sharedComponentPoolCandidates,
} from './sharedComponentPools';
import { buildHarmonyContentInstances, harmonyContentCandidates } from './harmonyContent';
import {
  buildDrumDerivedEndpointInstances,
  buildGranularAndWaterDerivedEndpointInstances,
  buildPadDerivedEndpointInstances,
  derivedEndpointCandidates,
} from './derivedEndpointContent';
import { extractOptimizedStatePresetData } from './statePresetOptimization';

const state = DEFAULT_STATE as unknown as Record<string, unknown>;
const encoder = new TextEncoder();

function candidates(): PresetContentCandidate[] {
  const sequencers = [
    ...Array.from({ length: SYNTH_EUCLIDEAN_LANE_COUNT }, (_, laneIndex) =>
      buildSequencerContentGroup({ state, kind: 'synth', laneIndex })),
    ...Array.from({ length: DRUM_EUCLIDEAN_LANE_COUNT }, (_, laneIndex) =>
      buildSequencerContentGroup({ state, kind: 'drum', laneIndex })),
  ].flatMap(sequencerContentCandidates);
  const shared = [
    ...Array.from({ length: 4 }, (_, laneIndex) => buildGranularVoicePoolInstance(state, laneIndex)),
    ...Array.from({ length: 2 }, (_, laneIndex) => buildDynamicsEqPoolInstance(state, laneIndex)),
    ...Array.from({ length: 2 }, (_, laneIndex) => buildSampleVoicePoolInstance(state, laneIndex)),
    buildPadVoicePoolInstance(state, 0),
    buildPadVoicePoolInstance(state, 1),
  ];
  const endpoints = [
    ...buildPadDerivedEndpointInstances(state),
    ...buildDrumDerivedEndpointInstances(state),
    ...buildGranularAndWaterDerivedEndpointInstances(state),
  ];
  return [
    ...sequencers,
    ...sharedComponentPoolCandidates(shared),
    ...harmonyContentCandidates(buildHarmonyContentInstances(state)),
    ...derivedEndpointCandidates(endpoints),
  ];
}

const warmCandidates = candidates();
await preparePresetContentBatch(warmCandidates);
const samples: number[] = [];
let batch = await preparePresetContentBatch(warmCandidates);
for (let index = 0; index < 30; index += 1) {
  const started = performance.now();
  batch = await preparePresetContentBatch(candidates());
  samples.push(performance.now() - started);
}
samples.sort((left, right) => left - right);

const expandedBytes = encoder.encode(JSON.stringify(state)).byteLength;
const optimizedBytes = encoder.encode(JSON.stringify(extractOptimizedStatePresetData(DEFAULT_STATE))).byteLength;
const uniqueContentBytes = [...batch.uniqueByHash.values()]
  .reduce((total, node) => total + encoder.encode(node.canonicalJson).byteLength, 0);
const logicalContentBytes = [...batch.byId.values()]
  .reduce((total, node) => total + encoder.encode(node.canonicalJson).byteLength, 0);
const refCount = batch.byId.size;
const estimatedRefBytes = refCount * 128;
const projectedDirectStorageBytes = uniqueContentBytes + estimatedRefBytes;
const projectedEightVersionLogicalBytes = logicalContentBytes * 8;
const projectedEightVersionStorageBytes = uniqueContentBytes + estimatedRefBytes * 8;

console.log(JSON.stringify({
  schemaVersion: 1,
  fixture: 'DEFAULT_STATE',
  expandedBytes,
  optimizedBindingBytes: optimizedBytes,
  candidateRefs: refCount,
  uniquePayloads: batch.uniqueByHash.size,
  uniqueContentBytes,
  logicalContentBytes,
  estimatedRefBytes,
  projectedDirectStorageBytes,
  projectedDirectDedupSavingsBytes: logicalContentBytes - projectedDirectStorageBytes,
  projectedDirectDedupSavingsPercent: Number((((logicalContentBytes - projectedDirectStorageBytes) / logicalContentBytes) * 100).toFixed(2)),
  projectedEightVersionLogicalBytes,
  projectedEightVersionStorageBytes,
  projectedEightVersionSavingsPercent: Number((((projectedEightVersionLogicalBytes - projectedEightVersionStorageBytes) / projectedEightVersionLogicalBytes) * 100).toFixed(2)),
  preparationCpuMsMedian: Number(samples[Math.floor(samples.length / 2)]!.toFixed(3)),
  preparationCpuMsP95: Number(samples[Math.floor(samples.length * 0.95)]!.toFixed(3)),
}, null, 2));
