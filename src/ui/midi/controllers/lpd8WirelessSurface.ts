import type { KesshoMidiEndpointInfo } from '../../../native/midi/midiTypes';

export const LPD8_WIRELESS_SURFACE_ID = 'akai-lpd8-wireless' as const;
export const LPD8_WIRELESS_STORAGE_KEY = 'kessho.midiControllerSurface.akaiLpd8Wireless.v1';

export type Lpd8WirelessControlKind = 'pad' | 'knob';

export type Lpd8WirelessControlDefinition = {
  id: string;
  label: string;
  kind: Lpd8WirelessControlKind;
  index: number;
};

export const LPD8_WIRELESS_CONTROLS: readonly Lpd8WirelessControlDefinition[] = [
  ...Array.from({ length: 8 }, (_, index) => ({
    id: `pad-${index + 1}`,
    label: `Pad ${index + 1}`,
    kind: 'pad' as const,
    index: index + 1,
  })),
  ...Array.from({ length: 8 }, (_, index) => ({
    id: `knob-${index + 1}`,
    label: `K${index + 1}`,
    kind: 'knob' as const,
    index: index + 1,
  })),
];

export const LPD8_WIRELESS_SYSTEM_BUTTONS = [
  'SELECT',
  'BANK A/B',
  'FULL LEVEL',
  'NR CONFIG',
  'TAP TEMPO',
  'NOTE REPEAT',
] as const;

export type Lpd8WirelessControlAssignment = {
  controlID: string;
  ccNumber: number | null;
  channel: number;
  bindingID: string | null;
};

export type Lpd8WirelessSurfaceState = {
  version: 1;
  surfaceID: typeof LPD8_WIRELESS_SURFACE_ID;
  inputUniqueID: number | null;
  inputName: string | null;
  inputPersistentIdentity: string | null;
  assignments: Record<string, Lpd8WirelessControlAssignment>;
};

export function createEmptyLpd8WirelessSurfaceState(): Lpd8WirelessSurfaceState {
  return {
    version: 1,
    surfaceID: LPD8_WIRELESS_SURFACE_ID,
    inputUniqueID: null,
    inputName: null,
    inputPersistentIdentity: null,
    assignments: Object.fromEntries(LPD8_WIRELESS_CONTROLS.map((control) => [control.id, {
      controlID: control.id,
      ccNumber: null,
      channel: 0,
      bindingID: null,
    }])),
  };
}

export function loadLpd8WirelessSurfaceState(): Lpd8WirelessSurfaceState {
  const fallback = createEmptyLpd8WirelessSurfaceState();
  try {
    const raw = window.localStorage.getItem(LPD8_WIRELESS_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<Lpd8WirelessSurfaceState>;
    if (parsed.version !== 1 || parsed.surfaceID !== LPD8_WIRELESS_SURFACE_ID) return fallback;

    const assignments = { ...fallback.assignments };
    for (const control of LPD8_WIRELESS_CONTROLS) {
      const candidate = parsed.assignments?.[control.id];
      if (!candidate) continue;
      const ccNumber = typeof candidate.ccNumber === 'number' && Number.isFinite(candidate.ccNumber)
        ? Math.max(0, Math.min(127, Math.round(candidate.ccNumber)))
        : null;
      const channel = typeof candidate.channel === 'number' && Number.isFinite(candidate.channel)
        ? Math.max(0, Math.min(15, Math.round(candidate.channel)))
        : 0;
      assignments[control.id] = {
        controlID: control.id,
        ccNumber,
        channel,
        bindingID: typeof candidate.bindingID === 'string' && candidate.bindingID ? candidate.bindingID : null,
      };
    }

    return {
      version: 1,
      surfaceID: LPD8_WIRELESS_SURFACE_ID,
      inputUniqueID: typeof parsed.inputUniqueID === 'number' && Number.isFinite(parsed.inputUniqueID)
        ? parsed.inputUniqueID
        : null,
      inputName: typeof parsed.inputName === 'string' ? parsed.inputName : null,
      inputPersistentIdentity: typeof parsed.inputPersistentIdentity === 'string'
        ? parsed.inputPersistentIdentity
        : null,
      assignments,
    };
  } catch {
    return fallback;
  }
}

export function saveLpd8WirelessSurfaceState(state: Lpd8WirelessSurfaceState): void {
  try {
    window.localStorage.setItem(LPD8_WIRELESS_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Controller-surface metadata is an optional convenience layer.
  }
}

export function resolveLpd8WirelessInput(
  inputs: readonly KesshoMidiEndpointInfo[],
  state: Lpd8WirelessSurfaceState,
): KesshoMidiEndpointInfo | null {
  const connected = inputs.filter((input) => input.isConnected);
  if (state.inputPersistentIdentity) {
    const persistentMatch = connected.find((input) => input.persistentIdentity === state.inputPersistentIdentity);
    if (persistentMatch) return persistentMatch;
  }
  if (state.inputUniqueID !== null) {
    const idMatch = connected.find((input) => input.uniqueID === state.inputUniqueID);
    if (idMatch) return idMatch;
  }
  if (state.inputName) {
    const nameMatch = connected.find((input) => input.name === state.inputName || input.displayName === state.inputName);
    if (nameMatch) return nameMatch;
  }
  return connected.find((input) => /lpd8|akai/i.test(`${input.name} ${input.displayName ?? ''} ${input.manufacturer ?? ''}`))
    ?? connected[0]
    ?? null;
}
