import { ENGINE_TRIMS } from './outputTrims';
import { sourcePresetId } from './CoreProductPresetIds';
import { numberFromState } from './coreProductSnapshotState';
import type { ProductSourceSnapshot } from './coreProductSnapshotTypes';
import type { SampleSlotId } from './sampleLibraries/SampleLibraryTypes';
import { sampleSlotSnapshotFields } from './sampleLibraries/sampleSlotProductSnapshot';
import { readSampleSlotState } from './sampleLibraries/sampleSlotState';

export function assignSampleSlotSourceSnapshot(
  source: ProductSourceSnapshot,
  slotId: SampleSlotId,
  state: Record<string, unknown> | undefined,
): void {
  const slot = readSampleSlotState(state, slotId);
  Object.assign(source, sampleSlotSnapshotFields(slot));
  const numberFromSampleState = (suffix: string, fallback: number): number => {
    const explicit = numberFromState(state, `${slotId}${suffix}`, Number.NaN);
    return Number.isFinite(explicit) ? explicit : fallback;
  };
  source.enabled = slot.enabled;
  source.assetId = 0;
  source.level = slot.level * (slot.libraryKey === 'piano' ? ENGINE_TRIMS.piano : 1);
  source.distance = numberFromSampleState('Distance', source.distance);
  source.attackSeconds = slot.attackMs / 1000;
  source.decaySeconds = slot.decayMs / 1000;
  source.sustain = slot.sustain;
  source.holdSeconds = slot.holdMs / 1000;
  source.releaseSeconds = slot.releaseMs / 1000;
  source.reverbSend = numberFromSampleState('ReverbSend', source.reverbSend);
  source.delayASend = numberFromSampleState('DelayASend', source.delayASend);
  source.delayBSend = numberFromSampleState('DelayBSend', source.delayBSend);
  const slotTitle = slotId === 'sample1' ? 'Sample1' : 'Sample2';
  source.granularSend = numberFromState(state, `granular${slotTitle}Send`, source.granularSend);
  source.degradeSend = numberFromState(state, `degrade${slotTitle}Send`, source.degradeSend);
  source.diffuseSend = numberFromSampleState('DiffuseSend', source.diffuseSend);
  source.postLpfHz = numberFromSampleState('PostLPF', source.postLpfHz);
  source.stereoWidth = numberFromSampleState('StereoWidth', source.stereoWidth);
  source.presetId = sourcePresetId('sample', 'default', 'default');
}
