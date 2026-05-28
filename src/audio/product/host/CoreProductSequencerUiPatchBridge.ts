import type { ProductSequencerUiPatch } from '../ProductEngineTypes';
import type { CoreProductHostMethodCall } from './CoreProductHostInvoker';

// TODO(product-core-burn-down): remove this compatibility bridge.
// TODO(product-core-sequencer-events): replace these host-cache patch branches
// with generated ProductEvents or dirty product patches as each sequencer UI
// cache path becomes product-owned end to end. Remaining gaps:
// - evolve config events for drum/synth lane evolution settings;
// - sub-lane enabled/config events that carry enabled, step count, direction,
//   value mode, and range fields together;
// - synth/drum step override event batches that carry values, directions, and
//   range-mode payloads without relying on adapter caches;
// - pitch-settings and home-capture events that update Product-owned home
//   snapshots without host-only cache methods.
export function applyCoreProductSequencerUiPatch(
  callHost: CoreProductHostMethodCall,
  patch: ProductSequencerUiPatch,
): void {
  switch (patch.kind) {
    case 'drum-evolve-configs':
      callHost<void>('setDrumEuclidEvolveConfigs', patch.configs);
      return;
    case 'synth-evolve-configs':
      callHost<void>('setSynthEuclidEvolveConfigs', patch.configs);
      return;
    case 'drum-sub-lane-enabled':
      callHost<void>('setDrumSubLaneEnabled', patch.states);
      return;
    case 'synth-sub-lane-enabled':
      callHost<void>('setSynthSubLaneEnabled', patch.states);
      return;
    case 'synth-pitch-settings':
      callHost<void>('setSynthPitchSettings', patch.settings);
      return;
    case 'drum-step-overrides':
      callHost<void>('setDrumStepOverrides', patch.overrides);
      return;
    case 'synth-step-overrides':
      callHost<void>('setSynthStepOverrides', patch.overrides);
      return;
    case 'preset-home-snapshots':
      callHost<void>('setSequencerPresetHomeSnapshots');
      return;
    case 'capture-synth-lane-home':
      callHost<void>('captureSynthEuclidLaneHome', patch.laneIndex, patch.pitchState);
      return;
    case 'capture-drum-lane-home':
      callHost<void>('captureDrumEuclidLaneHome', patch.laneIndex, patch.pitchSettings, patch.pitchState);
      return;
    default: {
      const unknownPatch: never = patch;
      throw new Error(`Unknown Product sequencer UI patch: ${String((unknownPatch as { kind?: unknown }).kind)}`);
    }
  }
}
