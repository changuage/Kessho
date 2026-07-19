import {
  DEFAULT_NATURE_SAMPLE_IDS,
  type NatureFilterType,
  type NatureSampleId,
  type NatureSlotNumber,
  natureSampleDefinition,
} from './natureSampleCatalog';

export type NatureSlotStateKeys = Readonly<{
  slot: NatureSlotNumber;
  enabledKey: `nature${NatureSlotNumber}Enabled`;
  sampleIdKey: `nature${NatureSlotNumber}SampleId`;
  levelKey: `nature${NatureSlotNumber}Level`;
  sliceDurationKey: `nature${NatureSlotNumber}SliceDuration`;
  sliceDensityKey: `nature${NatureSlotNumber}SliceDensity`;
  filterTypeKey: `nature${NatureSlotNumber}FilterType`;
  filterCutoffKey: `nature${NatureSlotNumber}FilterCutoff`;
  filterResonanceKey: `nature${NatureSlotNumber}FilterResonance`;
}>;

const slotKeys = (slot: NatureSlotNumber): NatureSlotStateKeys => Object.freeze({
  slot,
  enabledKey: `nature${slot}Enabled`, sampleIdKey: `nature${slot}SampleId`, levelKey: `nature${slot}Level`,
  sliceDurationKey: `nature${slot}SliceDuration`, sliceDensityKey: `nature${slot}SliceDensity`,
  filterTypeKey: `nature${slot}FilterType`, filterCutoffKey: `nature${slot}FilterCutoff`,
  filterResonanceKey: `nature${slot}FilterResonance`,
});

export const NATURE_SLOT_KEYS = Object.freeze([slotKeys(1), slotKeys(2), slotKeys(3), slotKeys(4)]);
export type NatureSlotStatePatch = Record<string, unknown>;

export interface NatureSlotState {
  natureMasterEnabled: boolean;
  nature1Enabled: boolean; nature1SampleId: NatureSampleId; nature1Level: number;
  nature1SliceDuration: number; nature1SliceDensity: number; nature1FilterType: NatureFilterType;
  nature1FilterCutoff: number; nature1FilterResonance: number;
  nature2Enabled: boolean; nature2SampleId: NatureSampleId; nature2Level: number;
  nature2SliceDuration: number; nature2SliceDensity: number; nature2FilterType: NatureFilterType;
  nature2FilterCutoff: number; nature2FilterResonance: number;
  nature3Enabled: boolean; nature3SampleId: NatureSampleId; nature3Level: number;
  nature3SliceDuration: number; nature3SliceDensity: number; nature3FilterType: NatureFilterType;
  nature3FilterCutoff: number; nature3FilterResonance: number;
  nature4Enabled: boolean; nature4SampleId: NatureSampleId; nature4Level: number;
  nature4SliceDuration: number; nature4SliceDensity: number; nature4FilterType: NatureFilterType;
  nature4FilterCutoff: number; nature4FilterResonance: number;
}

export function defaultNatureSlotState(): NatureSlotState {
  const result: NatureSlotStatePatch = { natureMasterEnabled: false };
  const levels = [0, 0.6, 0.52, 0.5] as const;
  for (const keys of NATURE_SLOT_KEYS) {
    const entry = natureSampleDefinition(DEFAULT_NATURE_SAMPLE_IDS[keys.slot - 1], keys.slot);
    result[keys.enabledKey] = false;
    result[keys.sampleIdKey] = entry.id;
    result[keys.levelKey] = levels[keys.slot - 1] ?? 0.5;
    result[keys.sliceDurationKey] = Math.min(entry.defaultSliceDuration, entry.durationSeconds);
    result[keys.sliceDensityKey] = entry.defaultSliceDensity;
    result[keys.filterTypeKey] = entry.defaultFilterType;
    result[keys.filterCutoffKey] = entry.defaultFilterCutoff;
    result[keys.filterResonanceKey] = entry.defaultFilterResonance;
  }
  return result as unknown as NatureSlotState;
}

const finite = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const filterType = (value: unknown, fallback: NatureFilterType): NatureFilterType =>
  value === 'lowpass' || value === 'bandpass' || value === 'highpass' || value === 'notch' ? value : fallback;

/** Convert legacy Waves/Birds/Frogs state into stable Nature slots. Canonical values win. */
export function migrateLegacyNatureSlotState(input: Record<string, unknown>): NatureSlotStatePatch {
  const result: NatureSlotStatePatch = { ...input };
  const legacy = [
    { enabled: 'oceanSampleEnabled', level: 'oceanSampleLevel', slice: 'oceanSliceDuration', density: 'oceanSliceDensity' },
    { enabled: 'birdsEnabled', level: 'birdsLevel', slice: 'birdsSliceDuration', density: 'birdsSliceDensity' },
    { enabled: 'birds2Enabled', level: 'birds2Level', slice: 'birds2SliceDuration', density: 'birds2SliceDensity' },
    { enabled: 'frogsEnabled', level: 'frogsLevel', slice: 'frogsSliceDuration', density: 'frogsSliceDensity' },
  ] as const;
  const natureMaster = finite(input.natureLevel, 1);
  let anyEnabled = false;

  for (const keys of NATURE_SLOT_KEYS) {
    const old = legacy[keys.slot - 1];
    const entry = natureSampleDefinition(result[keys.sampleIdKey], keys.slot);
    const enabled = typeof result[keys.enabledKey] === 'boolean'
      ? result[keys.enabledKey] === true
      : Boolean(old && input[old.enabled] === true);
    anyEnabled ||= enabled;
    result[keys.enabledKey] = enabled;
    result[keys.sampleIdKey] = entry.id;
    const legacyLevel = old ? finite(input[old.level], keys.slot === 1 ? 0 : 0.5) : 0.5;
    result[keys.levelKey] = finite(result[keys.levelKey], keys.slot === 1 ? legacyLevel : legacyLevel * natureMaster);
    result[keys.sliceDurationKey] = Math.min(entry.durationSeconds, Math.max(1.5,
      finite(result[keys.sliceDurationKey], old ? finite(input[old.slice], entry.defaultSliceDuration) : entry.defaultSliceDuration)));
    result[keys.sliceDensityKey] = Math.max(0, Math.min(1,
      finite(result[keys.sliceDensityKey], old ? finite(input[old.density], entry.defaultSliceDensity) : entry.defaultSliceDensity)));
    const legacyFilterType = keys.slot === 1 ? input.oceanFilterType : undefined;
    const legacyFilterCutoff = keys.slot === 1 ? input.oceanFilterCutoff : undefined;
    const legacyFilterResonance = keys.slot === 1 ? input.oceanFilterResonance : undefined;
    result[keys.filterTypeKey] = filterType(result[keys.filterTypeKey] ?? legacyFilterType, entry.defaultFilterType);
    result[keys.filterCutoffKey] = Math.max(40, Math.min(20000,
      finite(result[keys.filterCutoffKey], finite(legacyFilterCutoff, entry.defaultFilterCutoff))));
    result[keys.filterResonanceKey] = Math.max(0, Math.min(1,
      finite(result[keys.filterResonanceKey], finite(legacyFilterResonance, entry.defaultFilterResonance))));
  }
  result.natureMasterEnabled = typeof input.natureMasterEnabled === 'boolean' ? input.natureMasterEnabled : anyEnabled;
  return result;
}

export function natureSlotEnabled(state: Record<string, unknown>, slot: NatureSlotNumber): boolean {
  const keys = NATURE_SLOT_KEYS[slot - 1] ?? NATURE_SLOT_KEYS[0]!;
  return state[keys.enabledKey] === true;
}

export function natureSlotSampleId(state: Record<string, unknown>, slot: NatureSlotNumber): NatureSampleId {
  const keys = NATURE_SLOT_KEYS[slot - 1] ?? NATURE_SLOT_KEYS[0]!;
  return natureSampleDefinition(state[keys.sampleIdKey], slot).id;
}
