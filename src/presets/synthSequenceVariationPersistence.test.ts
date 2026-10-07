import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_STATE,
  decodeStateFromUrl,
  encodeStateToUrl,
  type SliderState,
} from '../ui/state';
import { autoPrintSynthSequenceVariation } from '../ui/sequencer/synthSequenceVariations';
import {
  applySequencerContentComponents,
  buildSequencerContentGroup,
} from './sequencerContent';
import { buildPresetVersionMetadata } from './versionMetadataHelpers';
import { normalizePresetVersion } from './presetUtils';

function bank() {
  const result = autoPrintSynthSequenceVariation({
    phraseBeats: 4,
    baseLane: { overrides: {}, state: {} },
    notes: [{ onsetBeats: 0.25, durationBeats: 0.5, pitch: 60, velocity: 1 }],
  });
  assert.ok(result.bank);
  return result.bank;
}

test('variation banks round-trip through URL and preset metadata', () => {
  const source: SliderState = {
    ...DEFAULT_STATE,
    synthSequenceVariationBanks: [bank(), null, null, null],
  };
  const loaded = decodeStateFromUrl(`?${encodeStateToUrl(source)}`);
  assert.ok(loaded);
  assert.deepEqual(loaded.synthSequenceVariationBanks, source.synthSequenceVariationBanks);

  const metadata = buildPresetVersionMetadata({ synthSequenceVariationBanks: source.synthSequenceVariationBanks });
  assert.deepEqual(metadata?.synthSequenceVariationBanks, source.synthSequenceVariationBanks);
  const version = normalizePresetVersion({
    v: 1,
    note: 'variation bank',
    timestamp: Date.now(),
    data: JSON.parse(JSON.stringify(source)),
    ...metadata,
  });
  assert.ok(version);
  assert.deepEqual(version.synthSequenceVariationBanks, source.synthSequenceVariationBanks);
});

test('variation bank is a portable sequencer content component', () => {
  const source: SliderState = {
    ...DEFAULT_STATE,
    synthSequenceVariationBanks: [bank(), null, null, null],
  };
  const metadata = buildPresetVersionMetadata({ synthSequenceVariationBanks: source.synthSequenceVariationBanks });
  const group = buildSequencerContentGroup({ state: source, metadata, kind: 'synth', laneIndex: 0 });
  const component = group.components.find((candidate) => candidate.componentSlot === 'variation');
  assert.ok(component);
  assert.equal(component.contentType, 'sequencerVariation');
  const applied = applySequencerContentComponents({
    state: { ...DEFAULT_STATE, synthSequenceVariationBanks: [null, null, null, null] },
    metadata: {},
    kind: 'synth',
    laneIndex: 0,
    components: [component],
  });
  const appliedStateBanks = applied.statePatch.synthSequenceVariationBanks as typeof source.synthSequenceVariationBanks;
  assert.deepEqual(appliedStateBanks?.[0], source.synthSequenceVariationBanks[0]);
  assert.deepEqual(applied.metadata.synthSequenceVariationBanks?.[0], source.synthSequenceVariationBanks[0]);
});
