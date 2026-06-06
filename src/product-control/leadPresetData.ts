import { loadProductLead4opFMPresetVerified } from '../audio/CoreProductLeadPatch';
import { lead4opPresetMatchesLookup } from '../audio/lead4opfm';
import type { ProductControlStatePatch, ProductControlStateRecord } from './ProductControlState';

type LeadPresetSlotConfig = Readonly<{
  stateKey: string;
  dataKey: string;
  fallback: 'soft_rhodes' | 'gamelan';
}>;

const PRODUCT_CONTROL_LEAD_PRESET_SLOTS: readonly LeadPresetSlotConfig[] = [
  { stateKey: 'lead1PresetA', dataKey: 'lead1PresetAData', fallback: 'soft_rhodes' },
  { stateKey: 'lead1PresetB', dataKey: 'lead1PresetBData', fallback: 'gamelan' },
  { stateKey: 'lead2PresetC', dataKey: 'lead2PresetCData', fallback: 'soft_rhodes' },
  { stateKey: 'lead2PresetD', dataKey: 'lead2PresetDData', fallback: 'gamelan' },
] as const;

export const PRODUCT_CONTROL_LEAD_PRESET_DATA_KEYS = new Set<string>(
  PRODUCT_CONTROL_LEAD_PRESET_SLOTS.map((slot) => slot.dataKey),
);

function presetIdForSlot(state: Record<string, unknown>, slot: LeadPresetSlotConfig): string {
  const id = String(state[slot.stateKey] ?? slot.fallback).trim();
  return id || slot.fallback;
}

function hasMatchingLeadPresetData(data: unknown, presetId: string, fallback: string): boolean {
  if (data === undefined || data === null) {
    return presetId === fallback;
  }
  return lead4opPresetMatchesLookup(data, presetId, '');
}

export async function hydrateProductControlLeadPresetDataPatch(
  previous: ProductControlStateRecord,
  patch: ProductControlStatePatch,
): Promise<ProductControlStatePatch> {
  const nextState = { ...previous, ...patch } as ProductControlStateRecord;
  let dataPatch: Record<string, unknown> | null = null;

  for (const slot of PRODUCT_CONTROL_LEAD_PRESET_SLOTS) {
    const presetId = presetIdForSlot(nextState, slot);
    const currentData = nextState[slot.dataKey];
    if (hasMatchingLeadPresetData(currentData, presetId, slot.fallback)) continue;

    const preset = await loadProductLead4opFMPresetVerified(presetId, slot.fallback);
    dataPatch = {
      ...(dataPatch ?? {}),
      [slot.dataKey]: preset,
    };
    nextState[slot.dataKey] = preset;
  }

  return dataPatch ? { ...patch, ...dataPatch } as ProductControlStatePatch : patch;
}
