import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection';
import { productEngine } from '../audio/product/ProductEngineProxy';
import { resetProductControlStateForProductEngine } from '../product-control';
import { createCoreProductAutoStopEvent } from '../audio/coreProductEvents';
import type { KesshoMidiMessage } from '../native/capacitorMidiRouting';
import type {
  ProductDynamicsVisualTelemetry,
  ProductEngineState,
  ProductSimpleSequencerVisualPlanActive,
  ProductTelemetrySnapshot,
} from '../audio/product/ProductEngineTypes';
import { isCoreProductRangeKeySupported } from '../audio/coreProductEvents';
import type { ProductRuntimeLifecycle } from './useProductRuntimeLifecycle';

type ReferenceRuntimeAdapterModule = typeof import('./referenceRuntime/ReferenceRuntimeAdapter');

function loadReferenceRuntimeAdapter(): Promise<ReferenceRuntimeAdapterModule> {
  if (!import.meta.env.DEV) return Promise.reject(new Error('Reference runtime adapter is unavailable in production.'));
  return import('./referenceRuntime/ReferenceRuntimeAdapter');
}

export type ProductRuntimeStateProjection = Pick<
  ProductEngineState,
  'isRunning' | 'harmonyState' | 'currentSeed' | 'currentBucket' | 'cofCurrentStep' | 'harmonyPosition'
>;

export type ProductRuntimeStateSurface = {
  subscribe: (callback: (state: ProductRuntimeStateProjection) => void) => () => void;
  refresh?: () => Promise<ProductRuntimeStateProjection>;
  refreshIntervalMs?: number;
  getTransportDebugState: () => ProductEngineState['transportDebug'];
};

export type ProductRuntimeTelemetrySurface = {
  available: boolean;
  getTelemetry: () => ProductTelemetrySnapshot | null;
  getDynamicsVisualTelemetry: () => ProductDynamicsVisualTelemetry;
  setTelemetryCallback: (callback: ((telemetry: ProductTelemetrySnapshot) => void) | null) => void;
  setSimpleSequencerVisualPlanActive: (active: ProductSimpleSequencerVisualPlanActive) => void;
  setVisualTelemetryActive: (active: boolean) => void;
  setGranularUiActive: (active: boolean) => void;
  pushMidiMessage: (message: KesshoMidiMessage) => void;
  supportsRangeKey: (key: string) => boolean;
};

export type ProductRuntimeReferenceAdapterSurface = {
  available: boolean;
  load: () => Promise<ReferenceRuntimeAdapterModule['referenceRuntimeAdapter']>;
};

export type ProductRuntimeAutoStopSurface = {
  available: boolean;
  setAutoStopSeconds: (seconds: number | null) => void;
};

const unsupportedReferenceCapability = (name: string): never => {
  throw new Error(`Product Core capability ${name} is unavailable in the Web TS reference runtime.`);
};

function projectRuntimeState(state: ProductRuntimeStateProjection): ProductRuntimeStateProjection {
  return {
    isRunning: state.isRunning,
    harmonyState: state.harmonyState,
    currentSeed: state.currentSeed,
    currentBucket: state.currentBucket,
    cofCurrentStep: state.cofCurrentStep,
    harmonyPosition: state.harmonyPosition,
  };
}

function createCoreProductRuntimeStateSurface(): ProductRuntimeStateSurface {
  return {
    subscribe: (callback) => {
      productEngine.setStateChangeCallback((state) => callback(projectRuntimeState(state)));
      return () => productEngine.setStateChangeCallback(null);
    },
    refresh: async () => projectRuntimeState(productEngine.getProductState()),
    getTransportDebugState: () => productEngine.getProductState().transportDebug,
  };
}

function createReferenceRuntimeStateSurface(): ProductRuntimeStateSurface {
  return {
    subscribe: (callback) => {
      let cancelled = false;
      void loadReferenceRuntimeAdapter().then(({ referenceRuntimeAdapter }) => {
        if (cancelled) return;
        referenceRuntimeAdapter.setStateChangeCallback((state) => callback(projectRuntimeState(state)));
      });
      return () => {
        cancelled = true;
        void loadReferenceRuntimeAdapter().then(({ referenceRuntimeAdapter }) => {
          referenceRuntimeAdapter.setStateChangeCallback(null);
        });
      };
    },
    refresh: async () => {
      const { referenceRuntimeAdapter } = await loadReferenceRuntimeAdapter();
      return projectRuntimeState(await referenceRuntimeAdapter.readState());
    },
    refreshIntervalMs: 250,
    getTransportDebugState: () => null,
  };
}

function createCoreProductRuntimeTelemetrySurface(): ProductRuntimeTelemetrySurface {
  let readTelemetry: ProductRuntimeTelemetrySurface['getTelemetry'] | null = null;
  let readDynamicsVisualTelemetry: ProductRuntimeTelemetrySurface['getDynamicsVisualTelemetry'] | null = null;
  const getTelemetry = (): ProductTelemetrySnapshot | null => {
    readTelemetry ??= productEngine.getTelemetry;
    return readTelemetry();
  };
  const getDynamicsVisualTelemetry = (): ProductDynamicsVisualTelemetry => {
    readDynamicsVisualTelemetry ??= productEngine.getDynamicsVisualTelemetry;
    return readDynamicsVisualTelemetry();
  };
  return {
    available: true,
    getTelemetry,
    getDynamicsVisualTelemetry,
    setTelemetryCallback: (callback) => productEngine.setTelemetryCallback(callback),
    setSimpleSequencerVisualPlanActive: (active) => productEngine.setSimpleSequencerVisualPlanActive(active),
    setVisualTelemetryActive: (active) => productEngine.setVisualTelemetryActive(active),
    setGranularUiActive: (active) => productEngine.setGranularUiActive(active),
    pushMidiMessage: (message) => productEngine.pushMidiMessage(message),
    supportsRangeKey: isCoreProductRangeKeySupported,
  };
}

function createReferenceRuntimeTelemetrySurface(): ProductRuntimeTelemetrySurface {
  return {
    available: false,
    getTelemetry: () => null,
    getDynamicsVisualTelemetry: () => unsupportedReferenceCapability('dynamics telemetry'),
    setTelemetryCallback: () => unsupportedReferenceCapability('telemetry callbacks'),
    setSimpleSequencerVisualPlanActive: () => unsupportedReferenceCapability('simple sequencer visual plans'),
    setVisualTelemetryActive: () => unsupportedReferenceCapability('visual telemetry'),
    setGranularUiActive: () => unsupportedReferenceCapability('granular UI telemetry'),
    pushMidiMessage: () => unsupportedReferenceCapability('MIDI routing'),
    supportsRangeKey: () => true,
  };
}

function createCoreProductAutoStopSurface(): ProductRuntimeAutoStopSurface {
  return {
    available: true,
    setAutoStopSeconds: (seconds) => {
      productEngine.enqueueEvent(createCoreProductAutoStopEvent(seconds));
    },
  };
}

function createReferenceRuntimeAutoStopSurface(): ProductRuntimeAutoStopSurface {
  return {
    available: false,
    setAutoStopSeconds: () => unsupportedReferenceCapability('Product auto-stop scheduling'),
  };
}

export type ProductRuntimeConstruction = {
  isCoreProduct: boolean;
  lifecycle: ProductRuntimeLifecycle;
  state: ProductRuntimeStateSurface;
  telemetry: ProductRuntimeTelemetrySurface;
  referenceAdapter: ProductRuntimeReferenceAdapterSurface;
  autoStop: ProductRuntimeAutoStopSurface;
};

function createProductRuntimeReferenceAdapterSurface(available: boolean): ProductRuntimeReferenceAdapterSurface {
  return {
    available,
    load: async () => {
      if (!available) throw new Error('Reference runtime adapter is unavailable in Product Core.');
      return (await loadReferenceRuntimeAdapter()).referenceRuntimeAdapter;
    },
  };
}

function createCoreProductRuntimeLifecycle(): ProductRuntimeLifecycle {
  return {
    primeProductRuntimeAudio: () => productEngine.primeAudioContext(),
    startProductRuntime: async (stateToStart) => {
      resetProductControlStateForProductEngine(productEngine, stateToStart);
      await productEngine.start({ initialState: { ...stateToStart } });
    },
    resumeProductRuntime: () => productEngine.resume(),
    suspendProductRuntime: () => productEngine.suspend(),
    preloadProductRuntime: () => productEngine.preload(),
    stopProductRuntime: () => { void productEngine.stop(); },
    fadeProductRuntimeOutput: async (target, durationMs) => {
      productEngine.setOutputGain(target, durationMs / 1000);
      await new Promise((resolve) => window.setTimeout(resolve, durationMs));
    },
    getProductLifecycleState: () => productEngine.getLifecycleState(),
    supportsBackgroundResume: true,
  };
}

function createReferenceRuntimeLifecycle(): ProductRuntimeLifecycle {
  const requireReferenceAdapter = async () => {
    if (!import.meta.env.DEV) throw new Error('Reference runtime adapter is unavailable in production.');
    return (await loadReferenceRuntimeAdapter()).referenceRuntimeAdapter;
  };
  return {
    primeProductRuntimeAudio: () => { void requireReferenceAdapter().then((adapter) => adapter.primeAudio()); },
    startProductRuntime: async (stateToStart) => (await requireReferenceAdapter()).start(stateToStart),
    resumeProductRuntime: async () => (await requireReferenceAdapter()).resume(),
    suspendProductRuntime: async () => (await requireReferenceAdapter()).suspend(),
    preloadProductRuntime: async () => (await requireReferenceAdapter()).preload(),
    stopProductRuntime: () => { void requireReferenceAdapter().then((adapter) => adapter.stop()); },
    fadeProductRuntimeOutput: async (target, durationMs) => (await requireReferenceAdapter()).fadeOutput(target, durationMs),
    getProductLifecycleState: () => 'cold',
    supportsBackgroundResume: false,
  };
}

export function createProductRuntimeConstruction(productRuntimeMode: ProductRuntimeSelectionMode): ProductRuntimeConstruction {
  if (productRuntimeMode === 'core-product') {
    return {
      isCoreProduct: true,
      lifecycle: createCoreProductRuntimeLifecycle(),
      state: createCoreProductRuntimeStateSurface(),
      telemetry: createCoreProductRuntimeTelemetrySurface(),
      referenceAdapter: createProductRuntimeReferenceAdapterSurface(false),
      autoStop: createCoreProductAutoStopSurface(),
    };
  }
  return {
    isCoreProduct: false,
    lifecycle: createReferenceRuntimeLifecycle(),
    state: createReferenceRuntimeStateSurface(),
    telemetry: createReferenceRuntimeTelemetrySurface(),
    referenceAdapter: createProductRuntimeReferenceAdapterSurface(true),
    autoStop: createReferenceRuntimeAutoStopSurface(),
  };
}
