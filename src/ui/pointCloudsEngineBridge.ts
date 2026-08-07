import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { isCloudEnabled } from '../cloud/config';
import { createCoreProductParamEvent } from '../audio/coreProductEvents';
import { isFileOrOpaqueOrigin } from '../audio/embeddedProductCoreAssets';
import type { ProductTelemetrySnapshot } from '../audio/product/ProductEngineTypes';
import { productEngine } from '../audio/product/ProductEngineProxy';
import { KESSHO_PRODUCT_PARAM_IDS } from '../audio/generated/kesshoProductParams';
import { resolvePointCloudsStartPreset } from './pointCloudsPresetFallback';
import { applyPreset } from './presetUtils';
import type { SavedPreset } from '../presets/statePresetRuntime';
import type { ProductRuntimeTelemetrySurface } from './productRuntimeConstruction';
import type { SliderMode, SliderState } from './state';

export const POINT_CLOUDS_DEFAULT_PRESET_NAME = 'String Waves';
export const POINT_CLOUDS_EMBEDDED_ENGINE_MODE = window.__pointCloudsEmbeddedEngineMode === true;
export const POINT_CLOUDS_ENGINE_MODE = new URLSearchParams(window.location.search).has('point-clouds-engine')
  || POINT_CLOUDS_EMBEDDED_ENGINE_MODE;
export const PRODUCT_CLOUD_ENABLED = !POINT_CLOUDS_EMBEDDED_ENGINE_MODE && isCloudEnabled();

type PointCloudsPresetDefinition = {
  id: string;
  name: string;
};

const POINT_CLOUDS_PRESETS: readonly PointCloudsPresetDefinition[] = [
  { id: 'string-waves', name: POINT_CLOUDS_DEFAULT_PRESET_NAME },
];

function resolvePointCloudsPreset(idOrName = 'string-waves'): PointCloudsPresetDefinition | null {
  const query = idOrName.trim().toLowerCase();
  return POINT_CLOUDS_PRESETS.find((preset) => preset.id === query || preset.name.toLowerCase() === query) ?? null;
}

type PointCloudsKesshoStatus = {
  ready: true;
  isRunning: boolean;
  lifecycleState: ReturnType<typeof productEngine.getLifecycleState>;
  audioContextState: string | null;
  presetId: string;
  presetName: string;
  morphAmount: number;
  telemetry: ProductTelemetrySnapshot | null;
  sourceState: Pick<
    SliderState,
    'masterVolume' | 'leadEnabled' | 'leadLevel' | 'lead1Level' | 'lead1Density' |
    'synthLevel' | 'granularLevel' | 'drumLevel' | 'pianoLevel' | 'waterLevel' |
    'natureLevel' | 'insectsLevel' | 'natureMasterEnabled' | 'insectsMasterEnabled' |
    'padEnabled' | 'pad2Enabled' | 'reverbQuality'
  >;
};

type PointCloudsKesshoBridge = {
  start: (presetId?: string, options?: { reverbQuality?: SliderState['reverbQuality'] }) => Promise<void>;
  stop: () => void;
  listPresets: () => Array<{ id: string; name: string }>;
  getStatus: () => PointCloudsKesshoStatus;
  setMorph: (amount: number) => void;
};

type PointCloudsRuntime = {
  applyDualRangesFromPreset: (
    dualRanges?: Record<string, { min: number; max: number }>,
    sliderModes?: Record<string, SliderMode>,
  ) => void;
  handleStart: (state?: SliderState) => Promise<void>;
  handleStop: () => void;
  loadBundledPresetByName: (name: string) => Promise<SavedPreset | null>;
  loadCloudAutoStartPresetStrict: () => Promise<SavedPreset>;
  morphPosition: number;
  playbackIsRunning: boolean;
  primeProductRuntimeAudio: () => void;
  productRuntimeTelemetry: ProductRuntimeTelemetrySurface;
  restoreEvolveConfigs: (preset: SavedPreset) => void;
  restoreRoutingMuteGroupsFromPreset: (value: SavedPreset['routingMuteGroups']) => void;
  setMorphPresetA: Dispatch<SetStateAction<SavedPreset | null>>;
  setProductVisualTelemetryActive: (active: boolean) => void;
  statePresetName: string;
};

type PointCloudsBridgeOptions = {
  runtime: PointCloudsRuntime;
  stateRef: MutableRefObject<SliderState>;
  hasLoadedPresetRef: MutableRefObject<boolean>;
  setState: Dispatch<SetStateAction<SliderState>>;
  setStatePresetName: Dispatch<SetStateAction<string>>;
  setMorphPosition: Dispatch<SetStateAction<number>>;
};

declare global {
  interface Window {
    __pointCloudsKesshoBridge?: PointCloudsKesshoBridge;
    __pointCloudsEmbeddedEngineMode?: boolean;
    __pointCloudsEmbeddedStringWavesPreset?: SavedPreset;
  }
}

export function usePointCloudsEngineBridge({
  runtime,
  stateRef,
  hasLoadedPresetRef,
  setState,
  setStatePresetName,
  setMorphPosition,
}: PointCloudsBridgeOptions): void {
  const runtimeRef = useRef(runtime);
  runtimeRef.current = runtime;
  const presetIdRef = useRef('string-waves');

  useEffect(() => {
    if (!POINT_CLOUDS_ENGINE_MODE) return undefined;
    runtimeRef.current.setProductVisualTelemetryActive(true);
    const bridge: PointCloudsKesshoBridge = {
      start: async (presetId = 'string-waves', options = {}) => {
        const definition = resolvePointCloudsPreset(presetId);
        if (!definition) throw new Error(`Unknown Point Clouds preset: ${presetId}`);
        const requestedReverbQuality = options.reverbQuality;
        if (requestedReverbQuality !== undefined && !['ultra', 'balanced', 'lite'].includes(requestedReverbQuality)) {
          throw new Error(`Unknown Point Clouds reverb quality: ${String(requestedReverbQuality)}`);
        }

        const current = runtimeRef.current;
        current.primeProductRuntimeAudio();
        const preset = await resolvePointCloudsStartPreset({
          embeddedPreset: window.__pointCloudsEmbeddedStringWavesPreset,
          presetName: definition.name,
          loadCloudPreset: current.loadCloudAutoStartPresetStrict,
          loadBundledPreset: current.loadBundledPresetByName,
        });
        if (!preset) throw new Error(`Point Clouds preset "${definition.name}" is unavailable from cloud or bundled assets.`);
        if (preset.name.trim().toLowerCase() !== definition.name.toLowerCase()) {
          throw new Error(`Expected Point Clouds preset "${definition.name}", received "${preset.name}".`);
        }

        const result = applyPreset(preset, {
          loadMode: 'exact-as-saved',
          currentState: stateRef.current,
          updateEngine: false,
          resetCofDrift: false,
          normalize: (currentState) => currentState,
        });
        const nextState: SliderState = {
          ...result.state,
          ...(requestedReverbQuality ? { reverbQuality: requestedReverbQuality } : {}),
        };
        const nextPreset: SavedPreset = { ...result.preset, state: nextState };
        presetIdRef.current = definition.id;
        stateRef.current = nextState;
        setState(nextState);
        setStatePresetName(nextPreset.name);
        current.setMorphPresetA(nextPreset);
        current.restoreRoutingMuteGroupsFromPreset(nextPreset.routingMuteGroups);
        current.applyDualRangesFromPreset(nextPreset.dualRanges, nextPreset.sliderModes);
        current.restoreEvolveConfigs(nextPreset);
        hasLoadedPresetRef.current = true;
        await current.handleStart(nextState);
        if (requestedReverbQuality) {
          productEngine.enqueueEvents([createCoreProductParamEvent(
            KESSHO_PRODUCT_PARAM_IDS.FxReverbQuality,
            requestedReverbQuality === 'ultra' ? 0 : requestedReverbQuality === 'lite' ? 2 : 1,
          )]);
        }
        if (productEngine.getLifecycleState() !== 'running') {
          throw new Error('Kessho Product runtime did not enter the running state.');
        }
      },
      stop: () => runtimeRef.current.handleStop(),
      listPresets: () => POINT_CLOUDS_PRESETS.map(({ id, name }) => ({ id, name })),
      getStatus: () => {
        const current = runtimeRef.current;
        const state = stateRef.current;
        return {
          ready: true,
          isRunning: current.playbackIsRunning,
          lifecycleState: productEngine.getLifecycleState(),
          audioContextState: document.documentElement.dataset.coreProductAudioContextState ?? null,
          presetId: presetIdRef.current,
          presetName: current.statePresetName || POINT_CLOUDS_DEFAULT_PRESET_NAME,
          morphAmount: current.morphPosition / 100,
          telemetry: current.productRuntimeTelemetry.getTelemetry(),
          sourceState: {
            masterVolume: state.masterVolume,
            leadEnabled: state.leadEnabled,
            leadLevel: state.leadLevel,
            lead1Level: state.lead1Level,
            lead1Density: state.lead1Density,
            synthLevel: state.synthLevel,
            granularLevel: state.granularLevel,
            drumLevel: state.drumLevel,
            pianoLevel: state.pianoLevel,
            waterLevel: state.waterLevel,
            natureLevel: state.natureLevel,
            insectsLevel: state.insectsLevel,
            natureMasterEnabled: state.natureMasterEnabled,
            insectsMasterEnabled: state.insectsMasterEnabled,
            padEnabled: state.padEnabled,
            pad2Enabled: state.pad2Enabled,
            reverbQuality: state.reverbQuality,
          },
        };
      },
      setMorph: (amount) => setMorphPosition(Math.max(0, Math.min(1, Number.isFinite(amount) ? amount : 0)) * 100),
    };

    window.__pointCloudsKesshoBridge = bridge;
    if (window.parent !== window && !isFileOrOpaqueOrigin(window.location)) {
      try {
        window.parent.__pointCloudsKesshoBridge = bridge;
      } catch {
        // The postMessage handshake below remains authoritative for opaque frames.
      }
    }
    window.parent.postMessage(
      { type: 'point-clouds:kessho-ready' },
      isFileOrOpaqueOrigin(window.location) ? '*' : window.location.origin,
    );
    return undefined;
  }, []);
}
