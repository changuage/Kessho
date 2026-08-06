import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createCoreProductSnapshot } from '../coreProductSnapshot';
import { defaultHarmonyIntent } from '../CoreProductHarmonyControl';

function slot(id: number, rootMidi: number, scaleId: number, tension: number) {
  const intent = { ...defaultHarmonyIntent('slot', id), rootMode: 'absolute' as const, rootNote: rootMidi % 12, quality: 'maj' as const };
  return {
    id,
    name: `S${id + 1}`,
    locked: false,
    intent,
    chord: {
      intent,
      intentSource: 'confirmed' as const,
      exactMidiNotes: [rootMidi, rootMidi + 4, rootMidi + 7],
      recognizedLabel: 'endpoint',
      playbackBehavior: 'relative' as const,
      capturedContext: { rootMidi, rootMidiAnchor: rootMidi, scaleId, tension },
    },
  };
}

function progression(slotId: number) {
  return {
    version: 1,
    enabled: true,
    currentEventIndex: 0,
    events: [{ id: `endpoint-${slotId}`, source: { type: 'slot' as const, slotId }, duration: { unit: 'phrase' as const, value: 1 as const } }],
  };
}

test('Product snapshot wires morph endpoint context from authored A/B slot captures', () => {
  const snapshot = createCoreProductSnapshot({
    rootMidi: 60,
    rootNote: 0,
    scaleMode: 'manual',
    manualScale: 'Major (Ionian)',
    tension: 0.35,
    harmonyMorphPercent: 50,
    harmonyChordSlotsA: [slot(0, 60, 1, 0.2)],
    harmonyChordSlotsB: [slot(0, 67, 8, 0.8)],
    harmonyProgressionA: progression(0),
    harmonyProgressionB: progression(0),
  });

  assert.deepEqual(snapshot.harmony.morphEndpointRootMidi, [60, 67]);
  assert.deepEqual(snapshot.harmony.morphEndpointScaleId, [1, 8]);
  assert.deepEqual(snapshot.harmony.morphEndpointTension, [0.2, 0.8]);
});
