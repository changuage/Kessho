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
  const apply = (method: string, ...args: readonly unknown[]): void => {
    callHost<void>(method, ...args);
    callHost<void>('recordSequencerUiPatch', patch.revision ?? 0, patch.kind);
  };
  switch (patch.kind) {
    case 'drum-evolve-configs':
      apply('setDrumEuclidEvolveConfigs', patch.configs);
      return;
    case 'synth-evolve-configs':
      apply('setSynthEuclidEvolveConfigs', patch.configs);
      return;
    case 'drum-sub-lane-enabled':
      apply('setDrumSubLaneEnabled', patch.states);
      return;
    case 'synth-sub-lane-enabled':
      apply('setSynthSubLaneEnabled', patch.states);
      return;
    case 'drum-pitch-settings':
      apply('setDrumPitchSettings', patch.settings);
      return;
    case 'synth-pitch-settings':
      apply('setSynthPitchSettings', patch.settings);
      return;
    case 'drum-step-overrides':
      apply('setDrumStepOverrides', patch.overrides);
      return;
    case 'synth-step-overrides':
      apply('setSynthStepOverrides', patch.overrides);
      return;
    case 'preset-home-snapshots':
      apply('setSequencerPresetHomeSnapshots', patch.drumPitchSettings, patch.drumPitchStates, patch.synthPitchStates);
      return;
    case 'capture-synth-lane-home':
      apply('captureSynthEuclidLaneHome', patch.laneIndex, patch.pitchState);
      return;
    case 'capture-drum-lane-home':
      apply('captureDrumEuclidLaneHome', patch.laneIndex, patch.pitchSettings, patch.pitchState);
      return;
    default: {
      const unknownPatch: never = patch;
      throw new Error(`Unknown Product sequencer UI patch: ${String((unknownPatch as { kind?: unknown }).kind)}`);
    }
  }
}
