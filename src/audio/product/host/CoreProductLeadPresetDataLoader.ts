import { loadProductLead4opFMPresetVerified } from '../../CoreProductLeadPatch';

type LeadPresetSlot = 'A' | 'B' | 'C' | 'D';
type LeadPresetSlotConfig = {
  slot: LeadPresetSlot;
  stateKey: string;
  dataKey: string;
  fallback: string;
};

const PRODUCT_LEAD_PRESET_SLOTS: readonly LeadPresetSlotConfig[] = [
  { slot: 'A', stateKey: 'lead1PresetA', dataKey: 'lead1PresetAData', fallback: 'soft_rhodes' },
  { slot: 'B', stateKey: 'lead1PresetB', dataKey: 'lead1PresetBData', fallback: 'gamelan' },
  { slot: 'C', stateKey: 'lead2PresetC', dataKey: 'lead2PresetCData', fallback: 'soft_rhodes' },
  { slot: 'D', stateKey: 'lead2PresetD', dataKey: 'lead2PresetDData', fallback: 'gamelan' },
] as const;

const LEAD_PRESET_SLOT_BY_KEY = new Map<LeadPresetSlot, LeadPresetSlotConfig>(
  PRODUCT_LEAD_PRESET_SLOTS.map((slot) => [slot.slot, slot]),
);

function normalizeLeadPresetSlot(slot: unknown): LeadPresetSlot {
  const requested = String(slot ?? '').toUpperCase();
  return requested === 'A' || requested === 'B' || requested === 'C' || requested === 'D'
    ? requested
    : 'A';
}

function isLeadPresetData(value: unknown): boolean {
  return Boolean(value && typeof value === 'object');
}

function copyAdapterSlot(
  adapterState: Record<string, unknown>,
  slot: LeadPresetSlotConfig,
  id: string,
  data: unknown,
): Record<string, unknown> {
  const currentId = typeof adapterState[slot.stateKey] === 'string'
    ? adapterState[slot.stateKey]
    : undefined;
  if (currentId === id && adapterState[slot.dataKey] === data) return adapterState;

  const next = { ...adapterState, [slot.stateKey]: id };
  if (isLeadPresetData(data)) {
    next[slot.dataKey] = data;
  } else {
    delete next[slot.dataKey];
  }
  return next;
}

export class CoreProductLeadPresetDataLoader {
  async loadLeadPreset(slot: unknown, presetId: unknown): Promise<void> {
    const slotKey = normalizeLeadPresetSlot(slot);
    const config = LEAD_PRESET_SLOT_BY_KEY.get(slotKey);
    if (!config) return;

    const id = String(presetId ?? config.fallback);
    await loadProductLead4opFMPresetVerified(id, config.fallback);
  }

  syncPresetData(
    sliderState: Record<string, unknown>,
    adapterState: Record<string, unknown>,
  ): Record<string, unknown> {
    let nextAdapterState = adapterState;

    for (const slot of PRODUCT_LEAD_PRESET_SLOTS) {
      const id = String(sliderState[slot.stateKey] ?? slot.fallback);
      nextAdapterState = copyAdapterSlot(nextAdapterState, slot, id, sliderState[slot.dataKey]);
    }

    return nextAdapterState;
  }
}
