import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { createCoreProductSnapshot } from '../audio/coreProductSnapshot';
import type { CoreProductTelemetrySnapshot } from '../audio/coreProductTelemetry';
import type { JourneyConfig } from '../audio/journeyTypes';
import { productEngine } from '../audio/product/ProductEngineProxy';
import {
  compileBackgroundJourneyPlan,
  createBackgroundJourneyConfigFingerprint,
  optimizeBackgroundJourneySubset,
  type BackgroundJourneyPlan,
  type BackgroundJourneyPlanReason,
  type ResolvedBackgroundJourneyNode,
} from '../audio/product/journey/compileBackgroundJourneyPlan';
import type { ProductBackgroundJourneyReadiness } from '../audio/product/ports/ProductJourneyPort';
import {
  reconcileBackgroundJourneyTerminal,
  resolveBackgroundJourneyRuntimePhase,
} from '../audio/product/journey/reconcileBackgroundJourneyProjection';
import type { SavedPreset, SliderState } from './state';
import type { UseJourneyResult } from './journeyState';
import { useVisibleInterval } from './hooks/useVisibleInterval';

export type BackgroundJourneyUiState =
  | { status: 'idle' }
  | { status: 'planning' }
  | { status: 'preparing'; uploadedEvents: number; totalEvents: number }
  | { status: 'ready'; durationSeconds: number; assetBytes: number; sceneCount: number; revision: number }
  | { status: 'optimizable'; sceneCount: number; totalSceneCount: number; assetBytes: number }
  | { status: 'stale' }
  | { status: 'unavailable'; reason: BackgroundJourneyPlanReason | Exclude<Extract<ProductBackgroundJourneyReadiness, { status: 'not-ready' }>['reason'], never>; assetBytes?: number; requiredBytes?: number; limitBytes?: number };

type StartProductPlayback = (options: {
  state: SliderState;
  dualRanges: Record<string, { min: number; max: number }>;
  title: string;
}) => Promise<void>;

type PreparedJourney = {
  plan: BackgroundJourneyPlan;
  playableNodes: JourneyConfig['nodes'];
  presets: Map<string, SavedPreset>;
  configFingerprint: string;
};

type OptimizationContext = {
  config: JourneyConfig;
  playableNodes: JourneyConfig['nodes'];
  presets: Map<string, SavedPreset>;
  resolvedNodes: Map<string, ResolvedBackgroundJourneyNode>;
  productSeed: number;
  revision: number;
  sampleRate: number;
  configFingerprint: string;
};

function revisionFor(fingerprintValue: string): number {
  let hash = 2166136261;
  for (let index = 0; index < fingerprintValue.length; index += 1) {
    hash ^= fingerprintValue.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash || 1;
}

function uiStateFromHost(
  readiness: ProductBackgroundJourneyReadiness,
  plan: BackgroundJourneyPlan,
  sceneCount: number,
  sampleRate: number,
): BackgroundJourneyUiState {
  if (readiness.status === 'ready') {
    return {
      status: 'ready',
      durationSeconds: readiness.preparedFrames / Math.max(1, sampleRate),
      assetBytes: readiness.registeredAssetBytes,
      sceneCount,
      revision: readiness.revision,
    };
  }
  if (readiness.status === 'preparing') return readiness;
  if (readiness.status === 'not-ready') {
    return {
      status: 'unavailable',
      reason: readiness.reason,
      assetBytes: readiness.registeredAssetBytes,
      requiredBytes: readiness.requiredBytes,
      limitBytes: readiness.limitBytes,
    };
  }
  return { status: 'unavailable', reason: plan.entries.length ? 'runtime-error' : 'invalid-graph' };
}

export function useBackgroundJourneyRuntimeSurface(options: {
  config: JourneyConfig | null;
  journey: UseJourneyResult;
  resolveSavedPresetByName: (name: string) => Promise<SavedPreset | null>;
  startProductPlayback: StartProductPlayback;
  setIsJourneyPlaying: (playing: boolean) => void;
}) {
  const { config, journey, resolveSavedPresetByName, startProductPlayback, setIsJourneyPlaying } = options;
  const [uiState, setUiState] = useState<BackgroundJourneyUiState>({ status: 'idle' });
  const [telemetry, setTelemetry] = useState<CoreProductTelemetrySnapshot | null>(null);
  const [runtimeProjectionActive, setRuntimeProjectionActive] = useState(false);
  const [preparationPollingGeneration, setPreparationPollingGeneration] = useState<number | null>(null);
  const preparedRef = useRef<PreparedJourney | null>(null);
  const optimizationContextRef = useRef<OptimizationContext | null>(null);
  const optimizationCandidateRef = useRef<{ plan: BackgroundJourneyPlan; playableNodes: JourneyConfig['nodes']; assetBytes: number } | null>(null);
  const generationRef = useRef(0);
  const configFingerprint = useMemo(() => createBackgroundJourneyConfigFingerprint(config), [config]);
  const latestConfigFingerprintRef = useRef(configFingerprint);
  latestConfigFingerprintRef.current = configFingerprint;
  const appliedConfigFingerprintRef = useRef(configFingerprint);
  const terminalStateRef = useRef({ terminalRevision: null as number | null, observedRunning: false });

  useEffect(() => {
    if (appliedConfigFingerprintRef.current === configFingerprint) return;
    appliedConfigFingerprintRef.current = configFingerprint;
    generationRef.current += 1;
    productEngine.discardBackgroundJourney();
    journey.stop();
    setIsJourneyPlaying(false);
    setRuntimeProjectionActive(false);
    setPreparationPollingGeneration(null);
    setTelemetry(null);
    preparedRef.current = null;
    optimizationContextRef.current = null;
    optimizationCandidateRef.current = null;
    setUiState({ status: 'stale' });
  }, [configFingerprint, journey.stop, setIsJourneyPlaying]);

  useEffect(() => {
    if (!telemetry || !preparedRef.current) return;
    const prepared = preparedRef.current;
    const current = prepared.playableNodes[telemetry.journeyCurrentNodeIndex ?? 0];
    const next = prepared.playableNodes[telemetry.journeyNextNodeIndex ?? 0];
    const phase = resolveBackgroundJourneyRuntimePhase(telemetry);
    if (reconcileBackgroundJourneyTerminal(
      terminalStateRef.current,
      telemetry.journeyScheduleRevision ?? prepared.plan.revision,
      phase,
      !telemetry.transportRunning,
      {
        projectEnded: () => journey.projectProductRuntime({
          phase: 'ended',
          currentNodeId: next?.id ?? current?.id ?? null,
          nextNodeId: null,
          phraseProgress: 1,
          morphProgress: 1,
        }),
        stopJourney: journey.stop,
        clearPlaying: () => setIsJourneyPlaying(false),
        stopPolling: () => {
          setRuntimeProjectionActive(false);
          setTelemetry(null);
        },
        releaseAssets: () => {
          productEngine.discardBackgroundJourney();
          preparedRef.current = null;
          optimizationContextRef.current = null;
          optimizationCandidateRef.current = null;
          setUiState({ status: 'idle' });
        },
      },
    )) return;
    journey.projectProductRuntime({
      phase: phase === 'morphing' ? 'morphing' : 'playing',
      currentNodeId: current?.id ?? null,
      nextNodeId: next?.id ?? null,
      phraseProgress: telemetry.journeyHoldProgress ?? 0,
      morphProgress: telemetry.journeyMorphProgress ?? 0,
    });
  }, [journey.projectProductRuntime, journey.stop, setIsJourneyPlaying, telemetry]);

  useVisibleInterval(() => {
    productEngine.requestTelemetryOnce();
    setTelemetry(productEngine.getTelemetry());
  }, 100, { enabled: runtimeProjectionActive, immediate: true, pauseWhenHidden: true });

  useVisibleInterval(() => {
    const readiness = productEngine.getBackgroundJourneyReadiness();
    if (readiness.status === 'preparing') setUiState(readiness);
  }, 100, { enabled: preparationPollingGeneration !== null, immediate: true, pauseWhenHidden: true });

  const prepare = useCallback(async () => {
    if (!config || typeof document !== 'undefined' && document.visibilityState !== 'visible') {
      generationRef.current += 1;
      productEngine.discardBackgroundJourney();
      preparedRef.current = null;
      setUiState({ status: 'unavailable', reason: 'document-hidden' });
      return;
    }
    const generation = ++generationRef.current;
    const expectedFingerprint = configFingerprint;
    const isCurrent = () => generation === generationRef.current &&
      expectedFingerprint === latestConfigFingerprintRef.current;
    setUiState({ status: 'planning' });
    const playableNodes = config.nodes.filter((node) => node.position !== 'center' && node.presetId && node.presetId !== '__CENTER__');
    const presets = new Map<string, SavedPreset>();
    const resolvedNodes = new Map<string, ResolvedBackgroundJourneyNode>();
    for (const node of playableNodes) {
      const preset = await resolveSavedPresetByName(node.presetName);
      if (!isCurrent()) return;
      if (!preset) {
        productEngine.discardBackgroundJourney();
        setUiState({ status: 'unavailable', reason: 'missing-preset' });
        return;
      }
      const snapshot = createCoreProductSnapshot(preset.state as unknown as Record<string, unknown>);
      presets.set(node.id, preset);
      resolvedNodes.set(node.id, { snapshot, phraseSeconds: snapshot.transport.phraseSeconds });
    }
    const firstSnapshot = resolvedNodes.values().next().value?.snapshot;
    const revision = revisionFor(configFingerprint);
    const result = compileBackgroundJourneyPlan({
      config,
      resolvedNodes,
      productSeed: firstSnapshot?.rng.seed ?? 1,
      revision,
      sampleRate: productEngine.getTelemetry()?.sampleRate ?? 48_000,
    });
    if (result.status !== 'ready') {
      productEngine.discardBackgroundJourney();
      setUiState({ status: 'unavailable', reason: result.reason });
      return;
    }
    optimizationContextRef.current = {
      config,
      playableNodes,
      presets,
      resolvedNodes,
      productSeed: firstSnapshot?.rng.seed ?? 1,
      revision,
      sampleRate: productEngine.getTelemetry()?.sampleRate ?? 48_000,
      configFingerprint: expectedFingerprint,
    };
    const referencedStates = playableNodes
      .filter((_, index) => (result.plan.referencedNodeMask & (1 << index)) !== 0)
      .map((node) => presets.get(node.id)!.state);
    setPreparationPollingGeneration(generation);
    let readiness: ProductBackgroundJourneyReadiness;
    try {
      readiness = await productEngine.prepareBackgroundJourney(
        result.plan,
        referencedStates as unknown as readonly Readonly<Record<string, unknown>>[],
      );
    } finally {
      setPreparationPollingGeneration((current) => current === generation ? null : current);
    }
    if (!isCurrent()) {
      productEngine.discardBackgroundJourney();
      return;
    }
    setUiState(uiStateFromHost(readiness, result.plan, referencedStates.length, productEngine.getTelemetry()?.sampleRate ?? 48_000));
    if (readiness.status === 'ready') {
      preparedRef.current = { plan: result.plan, playableNodes, presets, configFingerprint };
    }
  }, [config, configFingerprint, resolveSavedPresetByName]);

  const findOptimization = useCallback(() => {
    const context = optimizationContextRef.current;
    if (!context || context.configFingerprint !== latestConfigFingerprintRef.current) return;
    const candidate = optimizeBackgroundJourneySubset({
      config: context.config,
      options: {
        resolvedNodes: context.resolvedNodes,
        productSeed: context.productSeed,
        revision: context.revision,
        sampleRate: context.sampleRate,
      },
      estimateAssets: (nodeIds) => {
        const states = nodeIds.map((nodeId) => context.presets.get(nodeId)!.state) as unknown as readonly Readonly<Record<string, unknown>>[];
        const estimate = productEngine.estimateBackgroundJourneyAssets(states);
        return {
          decodedBytes: estimate.complete ? estimate.decodedBytes : Number.MAX_SAFE_INTEGER,
          sharedAssetReuse: estimate.sharedAssetReuse,
        };
      },
    });
    if (!candidate) return;
    const playableNodes = context.playableNodes.filter((node) => candidate.nodeIds.includes(node.id));
    optimizationCandidateRef.current = { plan: candidate.plan, playableNodes, assetBytes: candidate.decodedAssetBytes };
    setUiState({
      status: 'optimizable',
      sceneCount: playableNodes.length,
      totalSceneCount: context.playableNodes.length,
      assetBytes: candidate.decodedAssetBytes,
    });
  }, []);

  const confirmOptimization = useCallback(async () => {
    const context = optimizationContextRef.current;
    const candidate = optimizationCandidateRef.current;
    if (!context || !candidate || context.configFingerprint !== latestConfigFingerprintRef.current) return;
    const generation = ++generationRef.current;
    const expectedFingerprint = context.configFingerprint;
    const states = candidate.playableNodes.map((node) => context.presets.get(node.id)!.state) as unknown as readonly Readonly<Record<string, unknown>>[];
    const readiness = await productEngine.prepareBackgroundJourney(candidate.plan, states);
    if (generation !== generationRef.current || expectedFingerprint !== latestConfigFingerprintRef.current) {
      productEngine.discardBackgroundJourney();
      return;
    }
    setUiState(uiStateFromHost(readiness, candidate.plan, candidate.playableNodes.length, context.sampleRate));
    if (readiness.status === 'ready') {
      preparedRef.current = {
        plan: candidate.plan,
        playableNodes: candidate.playableNodes,
        presets: context.presets,
        configFingerprint: expectedFingerprint,
      };
    }
  }, []);

  const startPrepared = useCallback(async (): Promise<boolean> => {
    const prepared = preparedRef.current;
    if (!prepared || uiState.status !== 'ready') return false;
    if (prepared.configFingerprint !== latestConfigFingerprintRef.current) {
      generationRef.current += 1;
      productEngine.discardBackgroundJourney();
      preparedRef.current = null;
      setUiState({ status: 'stale' });
      return false;
    }
    const firstEntry = prepared.plan.entries[0];
    const firstNode = firstEntry ? prepared.playableNodes[firstEntry.fromNodeIndex] : null;
    const preset = firstNode ? prepared.presets.get(firstNode.id) : null;
    if (!preset) return false;
    await startProductPlayback({
      state: preset.state,
      dualRanges: preset.dualRanges ?? {},
      title: config?.name || preset.name,
    });
    if (!productEngine.startBackgroundJourney(prepared.plan.revision)) {
      setUiState(uiStateFromHost(
        productEngine.getBackgroundJourneyReadiness(),
        prepared.plan,
        prepared.playableNodes.length,
        productEngine.getTelemetry()?.sampleRate ?? 48_000,
      ));
      return false;
    }
    terminalStateRef.current = { terminalRevision: null, observedRunning: false };
    setIsJourneyPlaying(true);
    setRuntimeProjectionActive(true);
    return true;
  }, [config?.name, setIsJourneyPlaying, startProductPlayback, uiState.status]);

  const foregroundOnly = useCallback(() => {
    generationRef.current += 1;
    productEngine.discardBackgroundJourney();
    preparedRef.current = null;
    journey.play();
  }, [journey.play]);

  const stop = useCallback(() => {
    productEngine.stopBackgroundJourney();
    journey.stop();
    setIsJourneyPlaying(false);
    setRuntimeProjectionActive(false);
    setTelemetry(null);
  }, [journey.stop, setIsJourneyPlaying]);

  const cancel = useCallback(() => {
    generationRef.current += 1;
    productEngine.discardBackgroundJourney();
    preparedRef.current = null;
    optimizationContextRef.current = null;
    optimizationCandidateRef.current = null;
    setRuntimeProjectionActive(false);
    setPreparationPollingGeneration(null);
    setTelemetry(null);
    journey.stop();
    setIsJourneyPlaying(false);
    setUiState({ status: 'idle' });
  }, [journey.stop, setIsJourneyPlaying]);

  return { uiState, prepare, findOptimization, confirmOptimization, startPrepared, foregroundOnly, stop, cancel };
}
