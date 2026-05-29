import type { CoreProductTelemetrySnapshot } from '../../coreProductTelemetry';
import { createCoreProductEngineState } from '../../CoreProductHostRuntimeGuards';
import { createCoreProductHostHarmonySnapshot, type CoreProductHostHarmonySnapshot } from '../../CoreProductHostHarmonyState';
import type { TransportDebugSnapshot } from '../../transport';
import type { ProductEngineState } from '../ProductEngineTypes';

type CoreProductEngineStateOptions = {
  isRunning: boolean;
  arrangementState: Record<string, unknown> | null;
  telemetry: CoreProductTelemetrySnapshot | null;
  transportDebug: TransportDebugSnapshot | null;
};

const EMPTY_HARMONY_SNAPSHOT: CoreProductHostHarmonySnapshot = {
  harmonyState: null,
  currentBucket: '',
  currentSeed: 0,
  signature: 'none',
};

export class CoreProductHarmonyStateBridge {
  private uiHarmonySnapshot: CoreProductHostHarmonySnapshot = EMPTY_HARMONY_SNAPSHOT;

  refresh(arrangementState: Record<string, unknown> | null, telemetry: CoreProductTelemetrySnapshot | null): boolean {
    const next = createCoreProductHostHarmonySnapshot(arrangementState, telemetry);
    if (next.signature === this.uiHarmonySnapshot.signature) return false;
    this.uiHarmonySnapshot = next;
    return true;
  }

  createEngineState(options: CoreProductEngineStateOptions): ProductEngineState {
    this.refresh(options.arrangementState, options.telemetry);
    const base = createCoreProductEngineState(options.isRunning);
    return {
      ...base,
      harmonyState: this.uiHarmonySnapshot.harmonyState,
      currentSeed: this.uiHarmonySnapshot.currentSeed,
      currentBucket: this.uiHarmonySnapshot.currentBucket,
      cofCurrentStep: this.uiHarmonySnapshot.harmonyState?.cof.currentStep ?? base.cofCurrentStep,
      transportDebug: options.transportDebug,
    };
  }
}
