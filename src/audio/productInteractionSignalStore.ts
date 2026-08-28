import {
  PRODUCT_INTERACTION_SOURCE,
  PRODUCT_INTERACTION_VERSION,
  type ProductInteractionSignalSnapshot,
} from './productInteractionVocabulary';

let latest: ProductInteractionSignalSnapshot | null = null;
let updatedAt = 0;
const MASTER_SOURCES = [PRODUCT_INTERACTION_SOURCE.master] as const;
const SYNTH_SOURCES = [PRODUCT_INTERACTION_SOURCE.pad1, PRODUCT_INTERACTION_SOURCE.pad2, PRODUCT_INTERACTION_SOURCE.lead1, PRODUCT_INTERACTION_SOURCE.lead2] as const;
const PAD_SOURCES = [PRODUCT_INTERACTION_SOURCE.pad1, PRODUCT_INTERACTION_SOURCE.pad2] as const;
const LEAD_SOURCES = [PRODUCT_INTERACTION_SOURCE.lead1, PRODUCT_INTERACTION_SOURCE.lead2] as const;
const DRUM_SOURCES = [PRODUCT_INTERACTION_SOURCE.drums] as const;
const EARTH_SOURCES = [PRODUCT_INTERACTION_SOURCE.sample1, PRODUCT_INTERACTION_SOURCE.soundscape, PRODUCT_INTERACTION_SOURCE.sample2] as const;
const FX_SOURCES = [PRODUCT_INTERACTION_SOURCE.fx] as const;

export function publishProductInteractionSignalSnapshot(
  snapshot: ProductInteractionSignalSnapshot | undefined,
  at = typeof performance === 'undefined' ? Date.now() : performance.now(),
): void {
  if (!snapshot || snapshot.version !== PRODUCT_INTERACTION_VERSION) return;
  latest = snapshot;
  updatedAt = at;
}

function maxSelected(values: readonly number[], validMask: number, indices: readonly number[]): number | null {
  let found = false;
  let result = 0;
  for (const index of indices) {
    if ((validMask & (1 << index)) === 0) continue;
    const value = values[index] ?? 0;
    if (Number.isFinite(value)) {
      result = Math.max(result, value);
      found = true;
    }
  }
  return found ? Math.max(0, Math.min(1, result)) : null;
}

export function readProductInteractionVisualizerSignal(
  channel: string,
  signal: string,
  at = typeof performance === 'undefined' ? Date.now() : performance.now(),
): number | null {
  const snapshot = latest;
  if (!snapshot || at - updatedAt > 1_600 || signal === 'phase') return null;
  const values = signal === 'transient'
    ? snapshot.onsetStrength
    : signal === 'density'
      ? snapshot.rms
      : snapshot.envelope;
  let indices: readonly number[];
  switch (channel) {
    case 'global': indices = MASTER_SOURCES; break;
    case 'synth': indices = SYNTH_SOURCES; break;
    case 'pad': indices = PAD_SOURCES; break;
    case 'lead': indices = LEAD_SOURCES; break;
    case 'drums': indices = DRUM_SOURCES; break;
    case 'earth': indices = EARTH_SOURCES; break;
    case 'granular':
    case 'delay':
    case 'reverb':
    case 'dynamics': indices = FX_SOURCES; break;
    default: return null;
  }
  const value = maxSelected(values, snapshot.validSourceMask, indices);
  if (value === null) return null;
  if (at - updatedAt <= 250 || signal === 'phase') return value;
  const released = value * Math.exp(-(at - updatedAt - 250) / 900);
  return released < 0.001 ? null : released;
}

export function resetProductInteractionSignalSnapshot(): void {
  latest = null;
  updatedAt = 0;
}
