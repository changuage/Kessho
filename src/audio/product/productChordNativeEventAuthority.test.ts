import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CORE_PRODUCT_STEP_VALUE_FIELDS,
} from '../coreProductEvents';
import { KESSHO_PRODUCT_EVENT_IDS } from '../generated/kesshoProductEvents';
import {
  createCoreProductSynthSequencerStepOverrideEvents,
} from './ProductSequencerStepOverrideEvents';
import { normalizeSequencerStepValueOverrides } from '../CoreProductHostSequencerAdapter';

test('chord play-note overrides carry harmony slot references instead of authoritative MIDI', () => {
  const overrides = {
    playNotes: [[{
      step: 2,
      slotId: 3,
      midi: 91,
      offsetMs: 12,
      velocity: 0.65,
      voiceIndex: 4,
    }]],
  };
  const normalized = normalizeSequencerStepValueOverrides(overrides, [[], [], [], []], true);
  const note = normalized[0]?.[0];
  assert.equal(note?.field, CORE_PRODUCT_STEP_VALUE_FIELDS.playNote);
  assert.equal(note?.value, -1);
  assert.equal(note?.harmonySlotId, 3);
  assert.equal(note?.value4, 4);

  const events = createCoreProductSynthSequencerStepOverrideEvents({
    playArps: [{
      enabled: true,
      mode: 'chord',
      arp: { length: 1, rate: 1, pulseMask: 1 },
      midiPattern: [],
      playNotes: [
        { step: 2, slotId: 3, midi: -1, offsetMs: 12, velocity: 0.65, voiceIndex: 4 },
        { step: 2, slotId: 3, midi: -1, offsetMs: 24, velocity: 0.55, voiceIndex: 5 },
      ],
    }],
  });
  const event = events.find((candidate) =>
    candidate.eventKind === KESSHO_PRODUCT_EVENT_IDS.SetSequencerStep &&
    candidate.paramId === 2 &&
    ((candidate.flags ?? 0) & 0xff00) === CORE_PRODUCT_STEP_VALUE_FIELDS.playNote);
  assert.ok(event);
  assert.equal(event.value, -1);
  assert.equal(event.value2, 12);
  assert.equal(event.value3, 0.65);
  assert.equal(event.value4, (3 + 1) * 32 + 4);
  assert.equal(
    events.filter((candidate) =>
      candidate.eventKind === KESSHO_PRODUCT_EVENT_IDS.SetSequencerStep &&
      candidate.paramId === 2 &&
      ((candidate.flags ?? 0) & 0xff00) === CORE_PRODUCT_STEP_VALUE_FIELDS.playNote,
    ).length,
    2,
  );
});
