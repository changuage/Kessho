import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { ProductEnginePort } from '../audio/product/ProductEnginePort';
import type { SliderMode, SliderState } from './state';
import {
  getRuntimeSliderDebugState,
  getRuntimeSliderFlashing,
  getRuntimeSliderPosition,
} from './runtimeSliderState';

type ActiveTab = 'global' | 'visualizer' | 'synth' | 'drums' | 'reverb' | 'granular' | 'earth' | 'delay' | 'dynamics' | 'routing';

type ProductRuntimeParityProbeOptions = {
  enabled: boolean;
  runtime: ProductEnginePort;
  productRuntimeSupportsRangeKey: (key: string) => boolean;
  setActiveTab: Dispatch<SetStateAction<ActiveTab>>;
  setDualSliderRanges: Dispatch<SetStateAction<Partial<Record<keyof SliderState, { min: number; max: number }>>>>;
  setSliderModes: Dispatch<SetStateAction<Record<string, SliderMode>>>;
  setState: Dispatch<SetStateAction<SliderState>>;
  setUiMode: Dispatch<SetStateAction<'snowflake' | 'advanced' | 'journey'>>;
  stateRef: MutableRefObject<SliderState>;
};

function waitForProbeUiCommit(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => window.setTimeout(resolve, 50)));
  });
}

declare global {
  interface Window {
    __kesshoProductRuntimeProbe?: {
      startState(options?: {
        statePatch?: Partial<SliderState>;
        activeTab?: ActiveTab;
      }): Promise<void>;
      applyStatePatch(options: {
        patch: Partial<SliderState>;
        activeTab?: ActiveTab;
      }): Promise<void>;
      readProductStateProbe(): {
        telemetry: ReturnType<ProductEnginePort['getTelemetry']>;
        diagnostics: ReturnType<ProductEnginePort['getDiagnostics']>;
      };
      configureRuntimeWalk(options: {
        key: string;
        range: { min: number; max: number };
        activeTab?: ActiveTab;
        statePatch?: Partial<SliderState>;
      }): Promise<void>;
      configureSampleHold(options: {
        key: string;
        range: { min: number; max: number };
        activeTab?: ActiveTab;
        statePatch?: Partial<SliderState>;
      }): Promise<void>;
      triggerSampleHoldNote(options?: {
        source?: 'pad1' | 'pad2' | 'lead1' | 'lead2' | 'piano';
        midi?: number;
        velocity?: number;
        durationMs?: number;
      }): Promise<void>;
      readRuntimeWalkProbe(key: string): {
        position?: number;
        runtimeSliderDebug: ReturnType<typeof getRuntimeSliderDebugState>;
        telemetry: ReturnType<ProductEnginePort['getTelemetry']>;
        diagnostics: ReturnType<ProductEnginePort['getDiagnostics']>;
      };
      readSampleHoldProbe(key: string): {
        position?: number;
        flashing: boolean;
        runtimeSliderDebug: ReturnType<typeof getRuntimeSliderDebugState>;
        telemetry: ReturnType<ProductEnginePort['getTelemetry']>;
        diagnostics: ReturnType<ProductEnginePort['getDiagnostics']>;
      };
    };
  }
}

export function useProductRuntimeParityProbe({
  enabled,
  runtime,
  productRuntimeSupportsRangeKey,
  setActiveTab,
  setDualSliderRanges,
  setSliderModes,
  setState,
  setUiMode,
  stateRef,
}: ProductRuntimeParityProbeOptions): void {
  useEffect(() => {
    if (!enabled) return;
    const configureRange = async (
      keyText: string,
      mode: SliderMode,
      range: { min: number; max: number },
      statePatch: Partial<SliderState> | undefined,
      activeTab: ActiveTab,
    ) => {
      const key = keyText as keyof SliderState;
      if (!productRuntimeSupportsRangeKey(keyText)) {
        throw new Error(`Product runtime does not support range key: ${keyText}`);
      }
      const nextState = { ...stateRef.current, ...(statePatch ?? {}) } as SliderState;
      setUiMode('advanced');
      setActiveTab(activeTab);
      setSliderModes((prev) => ({ ...prev, [keyText]: mode }));
      setDualSliderRanges((prev) => ({ ...prev, [key]: range }));
      setState(nextState);
      await waitForProbeUiCommit();
      await runtime.start({ initialState: nextState as unknown as Record<string, unknown> });
    };

    window.__kesshoProductRuntimeProbe = {
      async startState(options = {}) {
        const nextState = { ...stateRef.current, ...(options.statePatch ?? {}) } as SliderState;
        setUiMode('advanced');
        setActiveTab(options.activeTab ?? 'synth');
        setState(nextState);
        await waitForProbeUiCommit();
        await runtime.start({ initialState: nextState as unknown as Record<string, unknown> });
      },
      async applyStatePatch(options) {
        const nextState = { ...stateRef.current, ...options.patch } as SliderState;
        setUiMode('advanced');
        if (options.activeTab) setActiveTab(options.activeTab);
        setState(nextState);
        await waitForProbeUiCommit();
      },
      readProductStateProbe() {
        return {
          telemetry: runtime.getTelemetry(),
          diagnostics: runtime.getDiagnostics(),
        };
      },
      configureRuntimeWalk: (options) => configureRange(
        options.key,
        'walk',
        options.range,
        options.statePatch,
        options.activeTab ?? 'global',
      ),
      configureSampleHold: (options) => configureRange(
        options.key,
        'sampleHold',
        options.range,
        options.statePatch,
        options.activeTab ?? 'global',
      ),
      async triggerSampleHoldNote(options = {}) {
        await runtime.auditionSynthNote({
          source: options.source ?? 'pad1',
          midi: options.midi ?? 60,
          velocity: options.velocity ?? 0.9,
          durationMs: options.durationMs ?? 240,
        }, stateRef.current as unknown as Record<string, unknown>);
      },
      readRuntimeWalkProbe(key) {
        return {
          position: getRuntimeSliderPosition(key, 'walk'),
          runtimeSliderDebug: getRuntimeSliderDebugState(),
          telemetry: runtime.getTelemetry(),
          diagnostics: runtime.getDiagnostics(),
        };
      },
      readSampleHoldProbe(key) {
        return {
          position: getRuntimeSliderPosition(key, 'sampleHold'),
          flashing: getRuntimeSliderFlashing(key, 'sampleHold'),
          runtimeSliderDebug: getRuntimeSliderDebugState(),
          telemetry: runtime.getTelemetry(),
          diagnostics: runtime.getDiagnostics(),
        };
      },
    };
    return () => {
      delete window.__kesshoProductRuntimeProbe;
    };
  }, [
    enabled,
    productRuntimeSupportsRangeKey,
    runtime,
    setActiveTab,
    setDualSliderRanges,
    setSliderModes,
    setState,
    setUiMode,
    stateRef,
  ]);
}
