import type { CoreProductStepValueField } from '../../coreProductEvents';
import { addCoreProductRangePayload, applyCoreProductRangeSubLanePatch } from '../../CoreProductHostSequencerRangePayload';
import type { SequencerKind, SequencerStepValueOverride } from '../../CoreProductHostSequencerAdapter';
import type { CoreProductSubLaneEvolveResult } from '../../CoreProductHostSequencerSubLaneEvolve';

type EvolvedStepValuePayload = {
  key: 'pitch' | 'expression' | 'morph' | 'distance';
  values: number[];
};

type CoreProductEvolvedSubLanePayloadOptions = {
  sequencer: SequencerKind;
  laneIndex: number;
  result: CoreProductSubLaneEvolveResult;
  values: SequencerStepValueOverride[];
  evolvedStepValuePayload: (field: CoreProductStepValueField) => EvolvedStepValuePayload | null;
};

export function createCoreProductEvolvedSubLanePayload(
  options: CoreProductEvolvedSubLanePayloadOptions,
): Record<string, unknown> {
  const subLaneStates = applyCoreProductRangeSubLanePatch({ ...options.result.subLaneStates }, options.values);
  const payload: Record<string, unknown> = { subLaneStates };
  addCoreProductRangePayload(payload, options.sequencer, options.laneIndex, options.values);

  for (const [key, direction] of Object.entries(options.result.directionPayloads)) {
    if (options.sequencer === 'synth') {
      payload[key] = direction;
    } else {
      const lanes: (string | null)[] = [null, null, null, null];
      lanes[options.laneIndex] = direction;
      payload[key] = lanes;
    }
  }

  for (const field of options.result.changedValueFields ?? []) {
    const fieldPayload = options.evolvedStepValuePayload(field);
    if (!fieldPayload) continue;
    if (options.sequencer === 'synth') {
      payload[fieldPayload.key] = fieldPayload.values;
    } else {
      const lanes: (number[] | null)[] = [null, null, null, null];
      lanes[options.laneIndex] = fieldPayload.values;
      payload[fieldPayload.key] = lanes;
    }
  }

  return payload;
}
