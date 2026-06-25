import { CORE_PRODUCT_MODULATION_RANGE_MODE, createCoreProductModulationRangeEvent, isCoreProductRuntimeWalkStatePatchKey, resolveCoreProductDrumMorphRangeTarget, resolveCoreProductRangeTargets, type CoreProductEvent, type CoreProductModulationRangeMode, type CoreProductRangeTarget } from '../../coreProductEvents';
import type { CoreProductSnapshot } from '../../coreProductSnapshot';
import type { CoreProductTelemetrySnapshot } from '../../coreProductTelemetry';
import { coreProductRangeValueContext, mappedCoreProductRange, runtimeWalkPositionsFromTelemetry } from '../../CoreProductHostRuntimeGuards';
import { enrichCoreProductModulationDebug } from './CoreProductModulationDebugEnricher';
import { createCoreProductSampleHoldDebugState, snapshotCoreProductSampleHoldDebugState, updateCoreProductSampleHoldTriggerFeedback, type CoreProductSampleHoldDebugState } from './CoreProductSampleHoldFeedbackBridge';
import { createCoreProductRuntimeWalkDebugState, snapshotCoreProductRuntimeWalkDebugState, type CoreProductRuntimeWalkDebugState } from './CoreProductRuntimeWalkDebug';
type ProductRangeState = { range: { min: number; max: number }; targets: CoreProductRangeTarget[] };
type RuntimeWalkPositionUpdateOptions = Readonly<{ publish?: boolean }>;
type CoreProductModulationRangeBridgeOptions = {
  isRuntimeReady: () => boolean;
  latestProductSnapshot: () => CoreProductSnapshot | null;
  latestSliderState: () => Record<string, unknown> | null;
  post: (event: CoreProductEvent) => void;
  publish: (name: string, ...payload: unknown[]) => void;
  reportUnsupportedRangeKey: (key: string) => void;
  applyRuntimeWalkStatePatch?: (patch: Record<string, number>) => void;
};
export class CoreProductModulationRangeBridge {
  private readonly sampleHoldRanges = new Map<string, ProductRangeState>();
  private readonly drumSampleHoldRanges = new Map<string, ProductRangeState>();
  private readonly runtimeWalkRanges = new Map<string, ProductRangeState>();
  private readonly runtimeWalkControlNames = new Map<number, string>();
  private readonly runtimeWalkControlRanges = new Map<number, { min: number; max: number }>();
  private readonly modulationControlNames = new Map<number, string>();
  private readonly modulationControlRanges = new Map<number, { min: number; max: number }>();
  private readonly sampleHoldLastTriggerCounters = new Map<string, number>();
  private runtimeWalkPositions: Record<string, number> = {};
  private readonly runtimeWalkDebugState = createCoreProductRuntimeWalkDebugState();
  private readonly sampleHoldDebugState = createCoreProductSampleHoldDebugState();
  constructor(private readonly options: CoreProductModulationRangeBridgeOptions) {}
  getRuntimeWalkPositions(): Record<string, number> { return { ...this.runtimeWalkPositions }; }
  getRuntimeWalkDebugState(): CoreProductRuntimeWalkDebugState { return snapshotCoreProductRuntimeWalkDebugState(this.runtimeWalkDebugState); }
  getSampleHoldDebugState(): CoreProductSampleHoldDebugState { return snapshotCoreProductSampleHoldDebugState(this.sampleHoldDebugState); }
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
  setSampleHoldRanges(ranges: Partial<Record<string, { min: number; max: number }>>): void { this.syncRangeSet(this.sampleHoldRanges, ranges, CORE_PRODUCT_MODULATION_RANGE_MODE.sampleHold); }
  setRuntimeWalkRanges(ranges: Partial<Record<string, { min: number; max: number }>>): void {
    this.runtimeWalkDebugState.rangeSetCallCount += 1;
    this.runtimeWalkDebugState.rangeSetKeyCount = Object.keys(ranges).length;
    this.runtimeWalkDebugState.lastRangeKeys = Object.keys(ranges).sort();
    this.syncRangeSet(this.runtimeWalkRanges, ranges, CORE_PRODUCT_MODULATION_RANGE_MODE.randomWalk);
    this.publishRuntimeWalkStatePatch();
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
  updateRuntimeWalkPositions(telemetry: CoreProductTelemetrySnapshot, options: RuntimeWalkPositionUpdateOptions = {}): void {
    this.runtimeWalkDebugState.telemetryUpdateCount += 1;
    this.runtimeWalkDebugState.telemetryValueCount = telemetry.runtimeWalkValues ? Object.keys(telemetry.runtimeWalkValues).length : 0;
    const next = runtimeWalkPositionsFromTelemetry(
      telemetry.runtimeWalkValues,
      this.runtimeWalkControlNames,
      this.runtimeWalkControlRanges,
    );
    if (!next) return;
    this.runtimeWalkPositions = next;
    this.publishRuntimeWalkStatePatch();
    if (options.publish === false) return;
    this.publishRuntimeWalkPositions();
  }
  publishRuntimeWalkPositions(): void {
    this.runtimeWalkDebugState.publishedPositionCount += 1;
    this.runtimeWalkDebugState.lastPositionKeys = Object.keys(this.runtimeWalkPositions).sort();
    this.options.publish('runtimeWalkPositions', { ...this.runtimeWalkPositions });
  }
  private publishRuntimeWalkStatePatch(): void {
    if (!this.options.applyRuntimeWalkStatePatch) return;
    const patch: Record<string, number> = {};
    for (const [key, position] of Object.entries(this.runtimeWalkPositions)) {
      if (!isCoreProductRuntimeWalkStatePatchKey(key)) continue;
      const state = this.runtimeWalkRanges.get(key);
      if (!state) continue;
      const normalized = Math.max(0, Math.min(1, position));
      patch[key] = state.range.min + normalized * (state.range.max - state.range.min);
    }
    this.options.applyRuntimeWalkStatePatch(patch);
  }
  updateSampleHoldTriggerFeedback(telemetry: CoreProductTelemetrySnapshot): void {
    updateCoreProductSampleHoldTriggerFeedback({
      telemetry,
      triggerCounters: this.sampleHoldLastTriggerCounters,
      debugState: this.sampleHoldDebugState,
      publish: this.options.publish,
    });
  }
  enrichModulationDebug(telemetry: CoreProductTelemetrySnapshot): CoreProductTelemetrySnapshot {
    return {
      ...enrichCoreProductModulationDebug(telemetry, this.modulationControlNames, this.modulationControlRanges),
      sampleHoldDebug: this.getSampleHoldDebugState(),
    };
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
      const targets = resolveCoreProductRangeTargets(key, mode);
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
      this.runtimeWalkDebugState.activeControlNameCount = this.runtimeWalkControlNames.size;
    } else if (!range) {
      this.runtimeWalkControlNames.delete(target.controlId);
      this.runtimeWalkControlRanges.delete(target.controlId);
      this.runtimeWalkDebugState.activeControlNameCount = this.runtimeWalkControlNames.size;
    }
    if (range) {
      this.modulationControlNames.set(target.controlId, displayKey);
      this.modulationControlRanges.set(target.controlId, mappedCoreProductRange(target, range, context));
    } else {
      this.modulationControlNames.delete(target.controlId);
      this.modulationControlRanges.delete(target.controlId);
    }
    const event = createCoreProductModulationRangeEvent(
      target,
      range,
      mode,
      this.currentNumericValue(displayKey, range, latestSliderState),
      context,
    );
    if (mode === CORE_PRODUCT_MODULATION_RANGE_MODE.randomWalk) {
      this.runtimeWalkDebugState.postedEventCount += 1;
    }
    this.options.post(event);
  }
  private currentNumericValue(key: string, range: { min: number; max: number } | null, latestSliderState: Record<string, unknown> | null): number {
    const value = latestSliderState?.[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (range) return (range.min + range.max) * 0.5;
    return 0;
  }
}
