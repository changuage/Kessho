import assert from 'node:assert/strict';
import test from 'node:test';
import { CoreProductHarmonyStateBridge } from '../product/host/CoreProductHarmonyStateBridge';
import { resolveHarmonyProjection } from './harmonyProjection';
import type { CoreProductTelemetrySnapshot } from '../coreProductTelemetry';

const telemetry = (barIndex: number): CoreProductTelemetrySnapshot => ({
  schemaHash: 1,
  transportRunning: true,
  barIndex,
  phraseIndex: Math.floor(barIndex / 4),
  transportBarsPerPhrase: 4,
  activeSources: [],
} as unknown as CoreProductTelemetrySnapshot);

const state = {
  rootNote: 0,
  manualScale: 'Major (Ionian)',
  scaleMode: 'manual',
  tension: 0.3,
  transportBarsPerPhrase: 4,
  harmonyProgression: {
    version: 1,
    enabled: true,
    currentEventIndex: 0,
    events: [
      { id: 'long', source: { type: 'auto' }, duration: { unit: 'phrase', value: 2 } },
      { id: 'next', source: { type: 'auto' }, duration: { unit: 'bar', value: 1 } },
    ],
  },
};

test('production App projection path carries Product telemetry bars to canonical boundaries', () => {
  const bridge = new CoreProductHarmonyStateBridge();
  const atBar1 = bridge.createEngineState({ isRunning: true, arrangementState: state, telemetry: telemetry(1), transportDebug: null });
  const atBar8 = bridge.createEngineState({ isRunning: true, arrangementState: state, telemetry: telemetry(8), transportDebug: null });
  const first = resolveHarmonyProjection(state, { harmonyState: atBar1.harmonyState, barIndex: atBar1.harmonyPosition?.absoluteBarIndex ?? undefined, phraseIndex: atBar1.harmonyPosition?.phraseIndex ?? undefined });
  const second = resolveHarmonyProjection(state, { harmonyState: atBar8.harmonyState, barIndex: atBar8.harmonyPosition?.absoluteBarIndex ?? undefined, phraseIndex: atBar8.harmonyPosition?.phraseIndex ?? undefined });
  assert.equal(atBar1.harmonyPosition?.absoluteBarIndex, 1);
  assert.equal(first.position.eventIndex, 0, '2-phrase event must not advance after one bar');
  assert.equal(second.position.absoluteBarIndex, 8);
  assert.equal(second.position.eventIndex, 1, 'canonical event advances at its 8-bar boundary');
});
test('production path carries a one-bar event cycle boundary', () => {
  const bridge = new CoreProductHarmonyStateBridge();
  const oneBarState = { ...state, harmonyProgression: { ...state.harmonyProgression, events: [{ id: 'one', source: { type: 'auto' }, duration: { unit: 'bar', value: 1 } }] } };
  const atBar1 = bridge.createEngineState({ isRunning: true, arrangementState: oneBarState, telemetry: telemetry(1), transportDebug: null });
  const projection = resolveHarmonyProjection(oneBarState, { harmonyState: atBar1.harmonyState, barIndex: atBar1.harmonyPosition?.absoluteBarIndex ?? undefined, phraseIndex: atBar1.harmonyPosition?.phraseIndex ?? undefined });
  assert.equal(projection.position.absoluteBarIndex, 1);
  assert.equal(projection.position.eventIndex, 0);
});
