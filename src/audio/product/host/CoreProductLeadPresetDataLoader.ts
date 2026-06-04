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

export class CoreProductLeadPresetDataLoader {
  private readonly pendingLoads = new Map<LeadPresetSlot, string>();

  constructor(
    private readonly patchAdapterState: (patch: Record<string, unknown>) => void,
  ) {}

  async loadLeadPreset(slot: unknown, presetId: unknown): Promise<void> {
    const slotKey = normalizeLeadPresetSlot(slot);
    const config = LEAD_PRESET_SLOT_BY_KEY.get(slotKey);
    if (!config) return;

    const id = String(presetId ?? config.fallback);
    this.pendingLoads.set(slotKey, id);
    const preset = await loadProductLead4opFMPresetVerified(id, config.fallback);
    if (this.pendingLoads.get(slotKey) !== id) return;
    this.pendingLoads.delete(slotKey);
    this.patchAdapterState({ [config.stateKey]: id, [config.dataKey]: preset });
  }

  syncPresetData(
    sliderState: Record<string, unknown>,
    adapterState: Record<string, unknown>,
  ): Record<string, unknown> {
    let nextAdapterState = adapterState;

    for (const slot of PRODUCT_LEAD_PRESET_SLOTS) {
      const id = String(sliderState[slot.stateKey] ?? slot.fallback);
      const currentId = typeof nextAdapterState[slot.stateKey] === 'string'
        ? nextAdapterState[slot.stateKey]
        : undefined;
      const hasCurrentData = currentId === id && Boolean(nextAdapterState[slot.dataKey]);

      if (currentId !== id) {
        nextAdapterState = { ...nextAdapterState, [slot.stateKey]: id };
        delete nextAdapterState[slot.dataKey];
      }

      if (hasCurrentData || this.pendingLoads.get(slot.slot) === id) {
        continue;
      }

      this.pendingLoads.set(slot.slot, id);
      void loadProductLead4opFMPresetVerified(id, slot.fallback)
        .then((preset) => {
          if (this.pendingLoads.get(slot.slot) !== id) return;
          this.pendingLoads.delete(slot.slot);
          this.patchAdapterState({ [slot.stateKey]: id, [slot.dataKey]: preset });
        })
        .catch((error) => {
          if (this.pendingLoads.get(slot.slot) === id) {
            this.pendingLoads.delete(slot.slot);
          }
          console.warn(`Failed to hydrate Product Core lead preset ${slot.slot}:`, error);
        });
    }

    return nextAdapterState;
  }
}
