import { CORE_PRODUCT_MODULATION_RANGE_MODE, createCoreProductModulationRangeEvent, isCoreProductRuntimeWalkStatePatchKey, resolveCoreProductDrumMorphRangeTarget, resolveCoreProductRangeTargets, type CoreProductEvent, type CoreProductModulationRangeMode, type CoreProductRangeTarget } from '../../coreProductEvents';
import type { CoreProductSnapshot } from '../../coreProductSnapshot';
import type { CoreProductTelemetrySnapshot } from '../../coreProductTelemetry';
import { coreProductRangeValueContext, mappedCoreProductRange, runtimeWalkPositionsFromTelemetry } from '../../CoreProductHostRuntimeGuards';
import { enrichCoreProductModulationDebug } from './CoreProductModulationDebugEnricher';
import { createCoreProductSampleHoldDebugState, snapshotCoreProductSampleHoldDebugState, updateCoreProductSampleHoldTriggerFeedback, type CoreProductSampleHoldDebugState } from './CoreProductSampleHoldFeedbackBridge';
import { shouldPublishCoreProductSampleHoldFeedback, type CoreProductSampleHoldFeedbackCallbackLookup } from './CoreProductSampleHoldFeedbackPolicy';
import { createCoreProductRuntimeWalkDebugState, snapshotCoreProductRuntimeWalkDebugState, type CoreProductRuntimeWalkDebugState } from './CoreProductRuntimeWalkDebug';
import { recordSliderSystemCounter } from '../../../diagnostics/sliderSystemInstrumentation';
import type {
  ProductRuntimeModulationConfig,
  ProductRuntimeModulationRangeMap,
} from '../ProductEngineTypes';

function midpoint(range: { min: number; max: number }): number {
  return (range.min + range.max) * 0.5;
}

function clampToRange(value: number, range: { min: number; max: number }): number {
  return Math.max(range.min, Math.min(range.max, value));
}

function positionForRangeValue(value: number, range: { min: number; max: number }): number {
  const span = range.max - range.min;
  return span > 0 ? Math.max(0, Math.min(1, (value - range.min) / span)) : 0.5;
}

function valueForRangePosition(position: number, range: { min: number; max: number }): number {
  const normalized = Math.max(0, Math.min(1, position));
  return range.min + normalized * (range.max - range.min);
}

function recordsEqual(left: Record<string, number>, right: Record<string, number>): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  for (const key of rightKeys) {
    if (!Object.prototype.hasOwnProperty.call(left, key)) return false;
    if (Math.abs((left[key] ?? 0) - (right[key] ?? 0)) > 0.0005) return false;
  }
  return true;
}

type ProductRangeState = {
  range: { min: number; max: number };
  targets: CoreProductRangeTarget[];
  contextSignature: string;
  currentValue: number;
  mode?: CoreProductModulationRangeMode;
  modulation?: ProductRuntimeModulationConfig;
};
type RuntimeWalkPositionUpdateOptions = Readonly<{ publish?: boolean }>;
type CoreProductModulationRangeBridgeOptions = {
  isRuntimeReady: () => boolean;
  latestProductSnapshot: () => CoreProductSnapshot | null;
  latestSliderState: () => Record<string, unknown> | null;
  post: (event: CoreProductEvent) => void;
  hasCallback?: CoreProductSampleHoldFeedbackCallbackLookup;
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
    const state = this.options.latestSliderState();
    const speed = typeof state?.randomWalkSpeed === 'number' && Number.isFinite(state.randomWalkSpeed)
      ? state.randomWalkSpeed
      : 1;
    const relationship = state?.randomWalkMode === 'globalWalk' ? 'link' : 'free';
    const modulationRanges: ProductRuntimeModulationRangeMap = {};
    for (const [key, range] of Object.entries(ranges)) {
      if (!range) continue;
      modulationRanges[key] = {
        ...range,
        modulation: { mode: 'walk', source: 'a', relationship, speed },
      };
    }
    this.setRuntimeModulationRanges(modulationRanges);
  }
  setRuntimeModulationRanges(ranges: ProductRuntimeModulationRangeMap): void {
    this.runtimeWalkDebugState.rangeSetCallCount += 1;
    this.runtimeWalkDebugState.rangeSetKeyCount = Object.keys(ranges).length;
    this.runtimeWalkDebugState.lastRangeKeys = Object.keys(ranges).sort();
    this.captureRuntimeWalkCurrentValues();
    this.syncRuntimeModulationSet(ranges);
    const positionsChanged = this.reconcileRuntimeWalkPositions();
    this.publishRuntimeWalkStatePatch();
    if (positionsChanged && this.options.hasCallback?.('runtimeWalkPositions') !== false) {
      this.publishRuntimeWalkPositions();
    }
  }
  flushModulationRanges(): void {
    if (!this.options.isRuntimeReady()) return;
    for (const [key, state] of this.sampleHoldRanges.entries()) {
      for (const target of state.targets) this.postModulationRange(target, state.range, CORE_PRODUCT_MODULATION_RANGE_MODE.sampleHold, key, state.currentValue);
    }
    for (const [key, state] of this.drumSampleHoldRanges.entries()) {
      for (const target of state.targets) this.postModulationRange(target, state.range, CORE_PRODUCT_MODULATION_RANGE_MODE.sampleHold, key, state.currentValue);
    }
    this.flushRuntimeWalkRanges();
  }
  flushRuntimeWalkRanges(): void {
    if (!this.options.isRuntimeReady()) return;
    for (const [key, state] of this.runtimeWalkRanges.entries()) {
      const mode = state.mode ?? CORE_PRODUCT_MODULATION_RANGE_MODE.randomWalk;
      for (const target of state.targets) this.postModulationRange(target, state.range, mode, key, state.currentValue, state.modulation);
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
    this.updateRuntimeWalkCurrentValues(next);
    this.runtimeWalkPositions = next;
    this.publishRuntimeWalkStatePatch();
    if (options.publish === false) return;
    if (this.options.hasCallback?.('runtimeWalkPositions') === false) return;
    this.publishRuntimeWalkPositions();
  }
  publishRuntimeWalkPositions(): void { this.runtimeWalkDebugState.publishedPositionCount += 1; this.runtimeWalkDebugState.lastPositionKeys = Object.keys(this.runtimeWalkPositions).sort(); this.options.publish('runtimeWalkPositions', { ...this.runtimeWalkPositions }); }
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
  updateSampleHoldTriggerFeedback(telemetry: CoreProductTelemetrySnapshot, options: Readonly<{ publish?: boolean }> = {}): void {
    updateCoreProductSampleHoldTriggerFeedback({
      telemetry,
      triggerCounters: this.sampleHoldLastTriggerCounters,
      debugState: this.sampleHoldDebugState,
      publish: this.options.publish,
      publishFeedback: options.publish ?? shouldPublishCoreProductSampleHoldFeedback(this.options.hasCallback),
    });
  }
  enrichModulationDebug(telemetry: CoreProductTelemetrySnapshot): CoreProductTelemetrySnapshot {
    return {
      ...enrichCoreProductModulationDebug(telemetry, this.modulationControlNames, this.modulationControlRanges),
      sampleHoldDebug: this.getSampleHoldDebugState(),
    };
  }

  private captureRuntimeWalkCurrentValues(): void {
    for (const [key, state] of this.runtimeWalkRanges.entries()) {
      const position = this.runtimeWalkPositions[key];
      if (typeof position === 'number' && Number.isFinite(position)) {
        state.currentValue = valueForRangePosition(position, state.range);
      }
    }
  }

  private updateRuntimeWalkCurrentValues(positions: Record<string, number>): void {
    for (const [key, position] of Object.entries(positions)) {
      const state = this.runtimeWalkRanges.get(key);
      if (!state || !Number.isFinite(position)) continue;
      state.currentValue = valueForRangePosition(position, state.range);
    }
  }

  private currentValueOwnedByAnotherRange(
    store: Map<string, ProductRangeState>,
    targets: CoreProductRangeTarget[],
  ): number | undefined {
    const stores = [this.sampleHoldRanges, this.drumSampleHoldRanges, this.runtimeWalkRanges];
    for (const candidateStore of stores) {
      if (candidateStore === store) continue;
      for (const state of candidateStore.values()) {
        if (state.targets.some((candidate) => targets.some((target) => (
          candidate.targetId === target.targetId && candidate.paramId === target.paramId
        )))) {
          return state.currentValue;
        }
      }
    }
    return undefined;
  }

  private reconcileRuntimeWalkPositions(): boolean {
    const next: Record<string, number> = {};
    for (const [key, state] of this.runtimeWalkRanges.entries()) {
      state.currentValue = clampToRange(state.currentValue, state.range);
      next[key] = positionForRangeValue(state.currentValue, state.range);
    }
    const changed = !recordsEqual(this.runtimeWalkPositions, next);
    this.runtimeWalkPositions = next;
    return changed;
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
        store.delete(key);
        for (const previousTarget of previous.targets) {
          const targetOwnedElsewhere = this.targetOwnedByAnotherRange(previousTarget);
          if (targetOwnedElsewhere || !this.options.isRuntimeReady()) {
            this.unregisterRangeTargetMetadata(previousTarget, mode);
          } else {
            this.postModulationRange(previousTarget, null, mode, displayKey);
          }
        }
      }
      return;
    }
    const normalized = { min: Math.min(range.min, range.max), max: Math.max(range.min, range.max) };
    const targets = Array.isArray(target) ? target : [target];
    const contextSignature = this.currentRangeContextSignature();
    const previous = store.get(key);
    if (
      previous &&
      previous.range.min === normalized.min &&
      previous.range.max === normalized.max &&
      previous.contextSignature === contextSignature &&
      this.targetsEqual(previous.targets, targets)
    ) {
      return;
    }
    const currentValue = previous
      ? clampToRange(previous.currentValue, normalized)
      : clampToRange(this.currentValueOwnedByAnotherRange(store, targets) ?? midpoint(normalized), normalized);
    store.set(key, { range: normalized, targets, contextSignature, currentValue, mode });
    if (this.options.isRuntimeReady()) {
      for (const rangeTarget of targets) this.postModulationRange(rangeTarget, normalized, mode, displayKey, currentValue);
    }
  }

  private syncRangeSet(
    store: Map<string, ProductRangeState>,
    ranges: Partial<Record<string, { min: number; max: number }>>,
    mode: CoreProductModulationRangeMode,
  ): void {
    const nextKeys = new Set<string>();
    const contextSignature = this.currentRangeContextSignature();
    for (const [key, range] of Object.entries(ranges)) {
      if (!range || !Number.isFinite(range.min) || !Number.isFinite(range.max)) continue;
      const targets = resolveCoreProductRangeTargets(key, mode);
      if (targets.length === 0) {
        this.options.reportUnsupportedRangeKey(key);
        continue;
      }
      const normalized = { min: Math.min(range.min, range.max), max: Math.max(range.min, range.max) };
      nextKeys.add(key);
      const previous = store.get(key);
      if (
        previous &&
        previous.range.min === normalized.min &&
        previous.range.max === normalized.max &&
        previous.contextSignature === contextSignature &&
        this.targetsEqual(previous.targets, targets)
      ) {
        continue;
      }
      const currentValue = previous
        ? clampToRange(previous.currentValue, normalized)
        : clampToRange(this.currentValueOwnedByAnotherRange(store, targets) ?? midpoint(normalized), normalized);
      store.set(key, { range: normalized, targets, contextSignature, currentValue, mode });
      if (this.options.isRuntimeReady()) {
        for (const target of targets) this.postModulationRange(target, normalized, mode, key, currentValue);
      }
    }
    for (const [key, previous] of Array.from(store.entries())) {
      if (nextKeys.has(key)) continue;
      store.delete(key);
      for (const target of previous.targets) {
        const targetOwnedElsewhere = this.targetOwnedByAnotherRange(target);
        if (targetOwnedElsewhere || !this.options.isRuntimeReady()) {
          this.unregisterRangeTargetMetadata(target, mode);
        } else {
          this.postModulationRange(target, null, mode, key);
        }
      }
    }
  }

  private syncRuntimeModulationSet(ranges: ProductRuntimeModulationRangeMap): void {
    const nextKeys = new Set<string>();
    // Mapping context can be large; serialize it once per range-set update and
    // append only the small per-parameter modulation config inside the loop.
    const mappingContextSignature = this.currentRangeContextSignature();
    for (const [key, entry] of Object.entries(ranges)) {
      if (!entry || !Number.isFinite(entry.min) || !Number.isFinite(entry.max)) continue;
      const mode = entry.modulation.mode === 'shape'
        ? CORE_PRODUCT_MODULATION_RANGE_MODE.shapeLfo
        : CORE_PRODUCT_MODULATION_RANGE_MODE.randomWalk;
      const targets = resolveCoreProductRangeTargets(key, mode);
      if (targets.length === 0) {
        this.options.reportUnsupportedRangeKey(key);
        continue;
      }
      const normalized = { min: Math.min(entry.min, entry.max), max: Math.max(entry.min, entry.max) };
      const contextSignature = `${mappingContextSignature}|${JSON.stringify(entry.modulation)}`;
      nextKeys.add(key);
      const previous = this.runtimeWalkRanges.get(key);
      if (
        previous
        && previous.range.min === normalized.min
        && previous.range.max === normalized.max
        && previous.contextSignature === contextSignature
        && previous.mode === mode
        && this.targetsEqual(previous.targets, targets)
      ) {
        continue;
      }
      const currentValue = previous
        ? clampToRange(previous.currentValue, normalized)
        : clampToRange(this.currentValueOwnedByAnotherRange(this.runtimeWalkRanges, targets) ?? midpoint(normalized), normalized);
      const next: ProductRangeState = {
        range: normalized,
        targets,
        contextSignature,
        currentValue,
        mode,
        modulation: entry.modulation,
      };
      this.runtimeWalkRanges.set(key, next);
      if (this.options.isRuntimeReady()) {
        for (const target of targets) {
          this.postModulationRange(target, normalized, mode, key, currentValue, entry.modulation);
        }
      }
    }
    for (const [key, previous] of Array.from(this.runtimeWalkRanges.entries())) {
      if (nextKeys.has(key)) continue;
      this.runtimeWalkRanges.delete(key);
      const mode = previous.mode ?? CORE_PRODUCT_MODULATION_RANGE_MODE.randomWalk;
      for (const target of previous.targets) {
        const targetOwnedElsewhere = this.targetOwnedByAnotherRange(target);
        if (targetOwnedElsewhere || !this.options.isRuntimeReady()) {
          this.unregisterRangeTargetMetadata(target, mode);
        } else {
          this.postModulationRange(target, null, mode, key);
        }
      }
    }
  }

  private targetOwnedByAnotherRange(target: CoreProductRangeTarget): boolean {
    const stores = [this.sampleHoldRanges, this.drumSampleHoldRanges, this.runtimeWalkRanges];
    for (const store of stores) {
      for (const state of store.values()) {
        if (state.targets.some((candidate) => candidate.targetId === target.targetId && candidate.paramId === target.paramId)) {
          return true;
        }
      }
    }
    return false;
  }

  private controlOwnedByAnotherRange(target: CoreProductRangeTarget): boolean {
    const stores = [this.sampleHoldRanges, this.drumSampleHoldRanges, this.runtimeWalkRanges];
    for (const store of stores) {
      for (const state of store.values()) {
        if (state.targets.some((candidate) => candidate.controlId === target.controlId)) {
          return true;
        }
      }
    }
    return false;
  }

  private unregisterRangeTargetMetadata(target: CoreProductRangeTarget, mode: CoreProductModulationRangeMode): void {
    if (mode === CORE_PRODUCT_MODULATION_RANGE_MODE.randomWalk || mode === CORE_PRODUCT_MODULATION_RANGE_MODE.shapeLfo) {
      this.runtimeWalkControlNames.delete(target.controlId);
      this.runtimeWalkControlRanges.delete(target.controlId);
      this.runtimeWalkDebugState.activeControlNameCount = this.runtimeWalkControlNames.size;
    }
    if (!this.controlOwnedByAnotherRange(target)) {
      this.modulationControlNames.delete(target.controlId);
      this.modulationControlRanges.delete(target.controlId);
    }
  }

  private targetsEqual(left: CoreProductRangeTarget[], right: CoreProductRangeTarget[]): boolean {
    if (left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) {
      const leftTarget = left[index];
      const rightTarget = right[index];
      if (
        !leftTarget ||
        !rightTarget ||
        leftTarget.targetId !== rightTarget.targetId ||
        leftTarget.paramId !== rightTarget.paramId ||
        leftTarget.controlId !== rightTarget.controlId ||
        leftTarget.sampleHoldTrigger !== rightTarget.sampleHoldTrigger
      ) {
        return false;
      }
    }
    return true;
  }

  private currentRangeContextSignature(modulation?: ProductRuntimeModulationConfig): string {
    const latestProductSnapshot = this.options.latestProductSnapshot();
    const state = this.options.latestSliderState();
    const context = coreProductRangeValueContext(latestProductSnapshot?.transport.bpm, state);
    return JSON.stringify({
      bpm: context.bpm,
      randomWalkMode: context.randomWalkMode,
      randomWalkSpeed: context.randomWalkSpeed,
      modulation,
      state,
    });
  }
  private postModulationRange(
    target: CoreProductRangeTarget,
    range: { min: number; max: number } | null,
    mode: CoreProductModulationRangeMode,
    displayKey: string,
    currentValue = range ? midpoint(range) : 0,
    modulation?: ProductRuntimeModulationConfig,
  ): void {
    if (!this.options.isRuntimeReady()) {
      throw new Error('Core Product runtime cannot post modulation ranges before the product worklet is initialized');
    }
    const latestProductSnapshot = this.options.latestProductSnapshot();
    const latestSliderState = this.options.latestSliderState();
    const context = {
      ...coreProductRangeValueContext(latestProductSnapshot?.transport.bpm, latestSliderState),
      runtimeModulation: modulation,
    };
    const controlOwnedElsewhere = !range && this.controlOwnedByAnotherRange(target);
    const isContinuous = mode === CORE_PRODUCT_MODULATION_RANGE_MODE.randomWalk
      || mode === CORE_PRODUCT_MODULATION_RANGE_MODE.shapeLfo;
    if (isContinuous && range) {
      this.runtimeWalkControlNames.set(target.controlId, displayKey);
      this.runtimeWalkControlRanges.set(target.controlId, mappedCoreProductRange(target, range, context));
      this.runtimeWalkDebugState.activeControlNameCount = this.runtimeWalkControlNames.size;
    } else if (isContinuous && !range) {
      this.runtimeWalkControlNames.delete(target.controlId);
      this.runtimeWalkControlRanges.delete(target.controlId);
      this.runtimeWalkDebugState.activeControlNameCount = this.runtimeWalkControlNames.size;
    }
    if (range) {
      this.modulationControlNames.set(target.controlId, displayKey);
      this.modulationControlRanges.set(target.controlId, mappedCoreProductRange(target, range, context));
    } else if (!controlOwnedElsewhere) {
      this.modulationControlNames.delete(target.controlId);
      this.modulationControlRanges.delete(target.controlId);
    }
    const event = createCoreProductModulationRangeEvent(
      target,
      range,
      mode,
      currentValue,
      context,
    );
    if (isContinuous) {
      this.runtimeWalkDebugState.postedEventCount += 1;
    }
    recordSliderSystemCounter('productRangeEvents');
    this.options.post(event);
  }
}
