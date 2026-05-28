import {
  CORE_PRODUCT_MODULATION_RANGE_MODE,
  createCoreProductModulationRangeEvent,
  resolveCoreProductDrumMorphRangeTarget,
  resolveCoreProductRangeTargets,
  type CoreProductEvent,
  type CoreProductModulationRangeMode,
  type CoreProductRangeTarget,
} from '../../coreProductEvents';
import type { CoreProductSnapshot } from '../../coreProductSnapshot';
import type { CoreProductTelemetrySnapshot } from '../../coreProductTelemetry';
import {
  coreProductRangeValueContext,
  mappedCoreProductRange,
  runtimeWalkPositionsFromTelemetry,
} from '../../CoreProductHostRuntimeGuards';

type ProductRangeState = { range: { min: number; max: number }; targets: CoreProductRangeTarget[] };

type CoreProductModulationRangeBridgeOptions = {
  isRuntimeReady: () => boolean;
  latestProductSnapshot: () => CoreProductSnapshot | null;
  latestSliderState: () => Record<string, unknown> | null;
  post: (event: CoreProductEvent) => void;
  publish: (name: string, payload: unknown) => void;
  reportUnsupportedRangeKey: (key: string) => void;
};

export class CoreProductModulationRangeBridge {
  private readonly sampleHoldRanges = new Map<string, ProductRangeState>();
  private readonly drumSampleHoldRanges = new Map<string, ProductRangeState>();
  private readonly runtimeWalkRanges = new Map<string, ProductRangeState>();
  private readonly runtimeWalkControlNames = new Map<number, string>();
  private readonly runtimeWalkControlRanges = new Map<number, { min: number; max: number }>();
  private runtimeWalkPositions: Record<string, number> = {};

  constructor(private readonly options: CoreProductModulationRangeBridgeOptions) {}

  getRuntimeWalkPositions(): Record<string, number> {
    return { ...this.runtimeWalkPositions };
  }

  setDrumMorphRange(voiceIndex: number, range: { min: number; max: number } | null): void {
    const key = `drum:${voiceIndex}:morph`;
    const target = resolveCoreProductDrumMorphRangeTarget(voiceIndex, key);
    this.syncSingleRange(this.drumSampleHoldRanges, key, target, range, CORE_PRODUCT_MODULATION_RANGE_MODE.sampleHold, key);
  }

  setDrumParamSampleHoldRange(key: string, range: { min: number; max: number } | null): void {
    const targets = resolveCoreProductRangeTargets(key);
    if (targets.length === 0) {
      this.options.reportUnsupportedRangeKey(key);
      return;
    }
    this.syncSingleRange(this.drumSampleHoldRanges, key, targets, range, CORE_PRODUCT_MODULATION_RANGE_MODE.sampleHold, key);
  }

  setSampleHoldRanges(ranges: Partial<Record<string, { min: number; max: number }>>): void {
    this.syncRangeSet(this.sampleHoldRanges, ranges, CORE_PRODUCT_MODULATION_RANGE_MODE.sampleHold);
  }

  setRuntimeWalkRanges(ranges: Partial<Record<string, { min: number; max: number }>>): void {
    this.syncRangeSet(this.runtimeWalkRanges, ranges, CORE_PRODUCT_MODULATION_RANGE_MODE.randomWalk);
  }

  flushModulationRanges(): void {
    if (!this.options.isRuntimeReady()) return;
    for (const [key, state] of this.sampleHoldRanges.entries()) {
      for (const target of state.targets) this.postModulationRange(target, state.range, CORE_PRODUCT_MODULATION_RANGE_MODE.sampleHold, key);
    }
    for (const [key, state] of this.drumSampleHoldRanges.entries()) {
      for (const target of state.targets) this.postModulationRange(target, state.range, CORE_PRODUCT_MODULATION_RANGE_MODE.sampleHold, key);
    }
    this.flushRuntimeWalkRanges();
  }

  flushRuntimeWalkRanges(): void {
    if (!this.options.isRuntimeReady()) return;
    for (const [key, state] of this.runtimeWalkRanges.entries()) {
      for (const target of state.targets) this.postModulationRange(target, state.range, CORE_PRODUCT_MODULATION_RANGE_MODE.randomWalk, key);
    }
  }

  updateRuntimeWalkPositions(telemetry: CoreProductTelemetrySnapshot): void {
    const next = runtimeWalkPositionsFromTelemetry(
      telemetry.runtimeWalkValues,
      this.runtimeWalkControlNames,
      this.runtimeWalkControlRanges,
    );
    if (!next) return;
    this.runtimeWalkPositions = next;
    this.options.publish('runtimeWalkPositions', { ...next });
  }

  private syncSingleRange(
    store: Map<string, ProductRangeState>,
    key: string,
    target: CoreProductRangeTarget | CoreProductRangeTarget[],
    range: { min: number; max: number } | null,
    mode: CoreProductModulationRangeMode,
    displayKey: string,
  ): void {
    if (!range || !Number.isFinite(range.min) || !Number.isFinite(range.max)) {
      const previous = store.get(key);
      if (previous) {
        if (this.options.isRuntimeReady()) {
          for (const previousTarget of previous.targets) this.postModulationRange(previousTarget, null, mode, displayKey);
        }
        store.delete(key);
      }
      return;
    }
    const normalized = { min: Math.min(range.min, range.max), max: Math.max(range.min, range.max) };
    const targets = Array.isArray(target) ? target : [target];
    store.set(key, { range: normalized, targets });
    if (this.options.isRuntimeReady()) {
      for (const rangeTarget of targets) this.postModulationRange(rangeTarget, normalized, mode, displayKey);
    }
  }

  private syncRangeSet(
    store: Map<string, ProductRangeState>,
    ranges: Partial<Record<string, { min: number; max: number }>>,
    mode: CoreProductModulationRangeMode,
  ): void {
    const nextKeys = new Set<string>();
    for (const [key, range] of Object.entries(ranges)) {
      if (!range || !Number.isFinite(range.min) || !Number.isFinite(range.max)) continue;
      const targets = resolveCoreProductRangeTargets(key);
      if (targets.length === 0) {
        this.options.reportUnsupportedRangeKey(key);
        continue;
      }
      const normalized = { min: Math.min(range.min, range.max), max: Math.max(range.min, range.max) };
      store.set(key, { range: normalized, targets });
      nextKeys.add(key);
      if (this.options.isRuntimeReady()) {
        for (const target of targets) this.postModulationRange(target, normalized, mode, key);
      }
    }
    for (const [key, previous] of Array.from(store.entries())) {
      if (nextKeys.has(key)) continue;
      if (this.options.isRuntimeReady()) {
        for (const target of previous.targets) this.postModulationRange(target, null, mode, key);
      }
      store.delete(key);
    }
  }

  private postModulationRange(
    target: CoreProductRangeTarget,
    range: { min: number; max: number } | null,
    mode: CoreProductModulationRangeMode,
    displayKey: string,
  ): void {
    if (!this.options.isRuntimeReady()) {
      throw new Error('Core Product runtime cannot post modulation ranges before the product worklet is initialized');
    }
    const latestProductSnapshot = this.options.latestProductSnapshot();
    const latestSliderState = this.options.latestSliderState();
    const context = coreProductRangeValueContext(latestProductSnapshot?.transport.bpm, latestSliderState);
    if (mode === CORE_PRODUCT_MODULATION_RANGE_MODE.randomWalk && range) {
      this.runtimeWalkControlNames.set(target.controlId, displayKey);
      this.runtimeWalkControlRanges.set(target.controlId, mappedCoreProductRange(target, range, context));
    } else if (!range) {
      this.runtimeWalkControlNames.delete(target.controlId);
      this.runtimeWalkControlRanges.delete(target.controlId);
    }
    this.options.post(createCoreProductModulationRangeEvent(
      target,
      range,
      mode,
      this.currentNumericValue(displayKey, range, latestSliderState),
      context,
    ));
  }

  private currentNumericValue(
    key: string,
    range: { min: number; max: number } | null,
    latestSliderState: Record<string, unknown> | null,
  ): number {
    const value = latestSliderState?.[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (range) return (range.min + range.max) * 0.5;
    return 0;
  }
}
