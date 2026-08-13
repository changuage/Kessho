import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SliderState } from '../ui/state';
import { productEngine } from '../audio/product/ProductEngineProxy';
import {
  createCoreProductRoutingMuteGroupEvents,
  createCoreProductRoutingMuteGroupRecallEvent,
  routingMuteGroupSourceIdsFromMask,
} from '../audio/coreProductEvents';
import {
  captureRoutingMuteGroupSlot,
  createRoutingMuteGroupTransitionController,
  getRoutingMuteGroupBooleanStateSignature,
  getRoutingMuteGroupSeed,
  isRoutingMuteGroupSlotStored,
  normalizeRoutingMuteGroupPhraseRange,
  normalizeRoutingMuteGroupRandomSettings,
  normalizeRoutingMuteGroupsState,
  normalizeRoutingMuteGroupSlot,
  ROUTING_MUTE_GROUP_PHRASE_STEP,
  ROUTING_MUTE_GROUP_SLOT_COUNT,
  routingMuteGroupSlotColor,
  routingMuteGroupSlotPhraseRange,
  setRoutingMuteGroupRandomSettings,
  setRoutingMuteGroupSlot,
  setRoutingMuteGroupSlotPhraseRange,
  type RoutingMuteGroupPhraseRange,
  type RoutingMuteGroupRandomSettings,
  type RoutingMuteGroupRuntimeLevelPatch,
  type RoutingMuteGroupRuntimeLevelPatchOptions,
  type RoutingMuteGroupRuntimePhase,
  type RoutingMuteGroupRuntimeSnapshot,
  type RoutingMuteGroupsController,
  type RoutingMuteGroupsState,
  type SaveSlotResult,
} from '../ui/routing';

type UseRoutingMuteGroupSystemOptions = {
  state: SliderState;
  routingMuteGroups: RoutingMuteGroupsState;
  onRoutingMuteGroupsChange: (state: RoutingMuteGroupsState) => void;
  onRuntimeLevelPatchChange: (
    patch: RoutingMuteGroupRuntimeLevelPatch,
    options?: RoutingMuteGroupRuntimeLevelPatchOptions,
  ) => void;
  onBooleanParamChange: (key: keyof SliderState, value: boolean) => void;
  isRunning: boolean;
  phraseSeconds: number;
  productRuntimeActive: boolean;
};

type RuntimeTimer = ReturnType<typeof setTimeout>;

type RandomRuntimeState = {
  phase: RoutingMuteGroupRuntimePhase;
  nextSlotIndex: number | null;
  dueAtMs: number | null;
  remainingMs: number | null;
  transitionStartedAtMs: number | null;
  transitionEndAtMs: number | null;
  holdPhrases: number | null;
  transitionPhrases: number;
};

const EMPTY_RANDOM_RUNTIME: RandomRuntimeState = {
  phase: 'off',
  nextSlotIndex: null,
  dueAtMs: null,
  remainingMs: null,
  transitionStartedAtMs: null,
  transitionEndAtMs: null,
  holdPhrases: null,
  transitionPhrases: normalizeRoutingMuteGroupRandomSettings(undefined).transitionPhrases,
};

function clampSlotIndex(slotIndex: number): number {
  if (!Number.isInteger(slotIndex)) return 0;
  return Math.max(0, Math.min(ROUTING_MUTE_GROUP_SLOT_COUNT - 1, slotIndex));
}

function safePhraseSeconds(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function randomPhraseCount(range: RoutingMuteGroupPhraseRange): number {
  const normalized = normalizeRoutingMuteGroupPhraseRange(range);
  const steps = Math.max(0, Math.round((normalized.max - normalized.min) / ROUTING_MUTE_GROUP_PHRASE_STEP));
  return normalized.min + Math.floor(Math.random() * (steps + 1)) * ROUTING_MUTE_GROUP_PHRASE_STEP;
}

function savedSlotIndexes(
  groups: RoutingMuteGroupsState,
  settings: RoutingMuteGroupRandomSettings,
): number[] {
  const eligible = settings.eligibleSlotIndexes ? new Set(settings.eligibleSlotIndexes) : null;
  return groups.slots
    .map((slot, index) => ({ slot, index }))
    .filter(({ slot, index }) => !!slot && (!eligible || eligible.has(index)))
    .map(({ index }) => index);
}

function chooseRandomSlotIndex(
  groups: RoutingMuteGroupsState,
  settings: RoutingMuteGroupRandomSettings,
  currentSlotIndex: number | null,
): number | null {
  const storedIndexes = savedSlotIndexes(groups, settings);
  if (storedIndexes.length === 0) return null;
  const pool = settings.avoidRepeat && storedIndexes.length > 1 && currentSlotIndex !== null
    ? storedIndexes.filter((index) => index !== currentSlotIndex)
    : storedIndexes;
  return pool[Math.floor(Math.random() * pool.length)] ?? null;
}

function emptyRuntimeSnapshot(selectedSlotIndex: number): RoutingMuteGroupRuntimeSnapshot {
  return {
    randomEnabled: false,
    phase: 'off',
    activeSlotIndex: null,
    activeSlotColor: null,
    selectedSlotIndex,
    nextSlotIndex: null,
    nextSlotColor: null,
    secondsToNextChange: null,
    transitionProgress: 0,
    holdPhrases: null,
    transitionPhrases: EMPTY_RANDOM_RUNTIME.transitionPhrases,
    currentMutedSourceIds: [],
    nextMutedSourceIds: [],
  };
}

export function useRoutingMuteGroupSystem({
  state,
  routingMuteGroups,
  onRoutingMuteGroupsChange,
  onRuntimeLevelPatchChange,
  onBooleanParamChange,
  isRunning,
  phraseSeconds,
  productRuntimeActive,
}: UseRoutingMuteGroupSystemOptions): RoutingMuteGroupsController {
  const normalizedMuteGroups = normalizeRoutingMuteGroupsState(routingMuteGroups);
  const randomEnabled = normalizedMuteGroups.random?.enabled === true;
  const [activeSlotIndex, setActiveSlotIndex] = useState<number | null>(null);
  const [selectedSlotIndex, setSelectedSlotIndexState] = useState(0);
  const [runtimeSnapshot, setRuntimeSnapshot] = useState<RoutingMuteGroupRuntimeSnapshot>(() => (
    emptyRuntimeSnapshot(0)
  ));
  const productSceneStateSignature = useMemo(
    () => getRoutingMuteGroupBooleanStateSignature(state),
    [state],
  );
  const productSceneSeed = useMemo(
    () => getRoutingMuteGroupSeed(state),
    [state],
  );

  const stateRef = useRef(state);
  const muteGroupsRef = useRef(normalizedMuteGroups);
  const activeSlotIndexRef = useRef<number | null>(null);
  const selectedSlotIndexRef = useRef(0);
  const isRunningRef = useRef(isRunning);
  const phraseSecondsRef = useRef(safePhraseSeconds(phraseSeconds));
  const onRuntimeLevelPatchChangeRef = useRef(onRuntimeLevelPatchChange);
  const onBooleanParamChangeRef = useRef(onBooleanParamChange);
  const onRoutingMuteGroupsChangeRef = useRef(onRoutingMuteGroupsChange);
  const randomSwitchTimerRef = useRef<RuntimeTimer | null>(null);
  const randomPhaseTimerRef = useRef<RuntimeTimer | null>(null);
  const randomRuntimeRef = useRef<RandomRuntimeState>({ ...EMPTY_RANDOM_RUNTIME });
  const publishSnapshotRef = useRef<() => void>(() => {});

  stateRef.current = state;
  muteGroupsRef.current = normalizedMuteGroups;
  isRunningRef.current = isRunning;
  phraseSecondsRef.current = safePhraseSeconds(phraseSeconds);
  onRuntimeLevelPatchChangeRef.current = onRuntimeLevelPatchChange;
  onBooleanParamChangeRef.current = onBooleanParamChange;
  onRoutingMuteGroupsChangeRef.current = onRoutingMuteGroupsChange;

  const controller = useMemo(
    () => createRoutingMuteGroupTransitionController({
      getState: () => stateRef.current,
      onRuntimeLevelPatchChange: (patch, options) => onRuntimeLevelPatchChangeRef.current(patch, options),
      onBooleanParamChange: (key, value) => onBooleanParamChangeRef.current(key, value),
      onActiveSlotChange: (slotIndex) => {
        activeSlotIndexRef.current = slotIndex;
        setActiveSlotIndex(slotIndex);
        publishSnapshotRef.current();
      },
    }),
    [],
  );

  const clearRandomTimers = useCallback(() => {
    if (randomSwitchTimerRef.current) {
      clearTimeout(randomSwitchTimerRef.current);
      randomSwitchTimerRef.current = null;
    }
    if (randomPhaseTimerRef.current) {
      clearTimeout(randomPhaseTimerRef.current);
      randomPhaseTimerRef.current = null;
    }
  }, []);

  const transitionMsForSettings = useCallback((settings: RoutingMuteGroupRandomSettings): number => (
    settings.transitionPhrases * phraseSecondsRef.current * 1000
  ), []);

  const buildRuntimeSnapshot = useCallback((): RoutingMuteGroupRuntimeSnapshot => {
    const groups = muteGroupsRef.current;
    const settings = groups.random ?? normalizeRoutingMuteGroupRandomSettings(undefined);
    const runtime = randomRuntimeRef.current;
    const activeIndex = activeSlotIndexRef.current;
    const activeSlot = activeIndex === null ? null : groups.slots[activeIndex] ?? null;
    const nextSlot = runtime.nextSlotIndex === null ? null : groups.slots[runtime.nextSlotIndex] ?? null;
    const now = Date.now();
    const secondsToNextChange = settings.enabled && runtime.dueAtMs !== null
      ? Math.max(0, (runtime.dueAtMs - now) / 1000)
      : settings.enabled && runtime.remainingMs !== null
        ? Math.max(0, runtime.remainingMs / 1000)
        : null;
    const transitionProgress = settings.enabled
      && runtime.transitionStartedAtMs !== null
      && runtime.transitionEndAtMs !== null
      && runtime.transitionEndAtMs > runtime.transitionStartedAtMs
      ? Math.max(0, Math.min(1, (now - runtime.transitionStartedAtMs) / (runtime.transitionEndAtMs - runtime.transitionStartedAtMs)))
      : 0;

    return {
      randomEnabled: settings.enabled,
      phase: settings.enabled ? runtime.phase : activeIndex === null ? 'off' : 'holding',
      activeSlotIndex: activeIndex,
      activeSlotColor: activeIndex === null ? null : routingMuteGroupSlotColor(activeIndex, activeSlot),
      selectedSlotIndex: selectedSlotIndexRef.current,
      nextSlotIndex: settings.enabled ? runtime.nextSlotIndex : null,
      nextSlotColor: settings.enabled && runtime.nextSlotIndex !== null
        ? routingMuteGroupSlotColor(runtime.nextSlotIndex, nextSlot)
        : null,
      secondsToNextChange,
      transitionProgress,
      holdPhrases: settings.enabled ? runtime.holdPhrases : null,
      transitionPhrases: settings.transitionPhrases,
      currentMutedSourceIds: activeSlot?.mutedSourceIds ?? controller.getEffectiveMutedSourceIds().slice(),
      nextMutedSourceIds: settings.enabled ? nextSlot?.mutedSourceIds ?? [] : [],
    };
  }, [controller]);

  const publishRuntimeSnapshot = useCallback(() => {
    setRuntimeSnapshot(buildRuntimeSnapshot());
  }, [buildRuntimeSnapshot]);
  publishSnapshotRef.current = publishRuntimeSnapshot;

  useEffect(() => {
    if (!productRuntimeActive) return;
    const telemetry = productEngine.getTelemetry();
    productEngine.enqueueEvents(createCoreProductRoutingMuteGroupEvents(normalizedMuteGroups, {
      sampleRate: telemetry?.sampleRate ?? 48_000,
      phraseSeconds: phraseSecondsRef.current,
      seed: productSceneSeed,
      state: stateRef.current,
    }));
  }, [phraseSeconds, productRuntimeActive, productSceneSeed, productSceneStateSignature, routingMuteGroups]);

  useEffect(() => {
    if (!productRuntimeActive || typeof window === 'undefined') return undefined;
    let frame = 0;
    let lastReadMs = 0;
      const tick = (now: number) => {
      frame = window.requestAnimationFrame(tick);
      if (document.visibilityState !== 'visible' || now - lastReadMs < 100) return;
      lastReadMs = now;
      const telemetry = productEngine.getTelemetry();
      if (!telemetry) return;
      const rawActive = telemetry.routingMuteGroupActiveSlot ?? 0xffffffff;
      const rawNext = telemetry.routingMuteGroupNextSlot ?? 0xffffffff;
      const active = rawActive < ROUTING_MUTE_GROUP_SLOT_COUNT ? rawActive : null;
      const next = rawNext < ROUTING_MUTE_GROUP_SLOT_COUNT ? rawNext : null;
      const mask = telemetry.routingMuteGroupMask ?? 0;
      const progress = telemetry.routingMuteGroupTransitionProgress ?? 1;
      activeSlotIndexRef.current = active;
      setActiveSlotIndex(active);
      setRuntimeSnapshot({
        randomEnabled: telemetry.routingMuteGroupsEnabled === true,
        phase: telemetry.routingMuteGroupsEnabled
          ? progress < 1 ? 'transitioning' : active === null ? 'empty' : 'holding'
          : active === null ? 'off' : 'holding',
        activeSlotIndex: active,
        activeSlotColor: active === null ? null : routingMuteGroupSlotColor(active, muteGroupsRef.current.slots[active]),
        selectedSlotIndex: selectedSlotIndexRef.current,
        nextSlotIndex: next,
        nextSlotColor: next === null ? null : routingMuteGroupSlotColor(next, muteGroupsRef.current.slots[next]),
        secondsToNextChange: telemetry.routingMuteGroupNextChangeFrame !== undefined
          && telemetry.routingMuteGroupNextChangeFrame < Number.MAX_SAFE_INTEGER
          ? Math.max(0, telemetry.routingMuteGroupNextChangeFrame - (telemetry.absoluteSampleTime ?? 0)) /
            Math.max(1, telemetry.sampleRate ?? 48_000)
          : null,
        transitionProgress: progress,
        holdPhrases: null,
        transitionPhrases: muteGroupsRef.current.random?.transitionPhrases ?? 1,
        currentMutedSourceIds: routingMuteGroupSourceIdsFromMask(mask),
        nextMutedSourceIds: next === null ? [] : muteGroupsRef.current.slots[next]?.mutedSourceIds ?? [],
      });
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [productRuntimeActive]);

  const setSelectedSlotIndex = useCallback((slotIndex: number) => {
    const nextSlotIndex = clampSlotIndex(slotIndex);
    selectedSlotIndexRef.current = nextSlotIndex;
    setSelectedSlotIndexState(nextSlotIndex);
    publishSnapshotRef.current();
  }, []);

  const scheduleRandomCycle = useCallback((
    slotIndex: number,
    options: {
      recall: boolean;
      durationMs?: number;
      holdPhrases?: number | null;
    },
  ) => {
    const groups = muteGroupsRef.current;
    const settings = groups.random ?? normalizeRoutingMuteGroupRandomSettings(undefined);
    const slot = groups.slots[slotIndex];
    if (!settings.enabled || !slot) {
      clearRandomTimers();
      randomRuntimeRef.current = {
        ...EMPTY_RANDOM_RUNTIME,
        phase: settings.enabled ? 'empty' : 'off',
        transitionPhrases: settings.transitionPhrases,
      };
      publishSnapshotRef.current();
      return;
    }

    clearRandomTimers();
    const transitionMs = isRunningRef.current ? transitionMsForSettings(settings) : 0;
    const slotRange = routingMuteGroupSlotPhraseRange(slot, settings);
    const holdPhrases = options.holdPhrases ?? randomPhraseCount(slotRange);
    const holdMs = holdPhrases * phraseSecondsRef.current * 1000;
    const durationMs = Math.max(options.durationMs ?? holdMs, options.recall ? transitionMs : 0);
    const now = Date.now();
    const nextSlotIndex = chooseRandomSlotIndex(groups, settings, slotIndex);

    if (options.recall) {
      controller.recall(slot, slotIndex, { transitionMs });
    } else {
      activeSlotIndexRef.current = slotIndex;
      setActiveSlotIndex(slotIndex);
    }

    randomRuntimeRef.current = {
      phase: options.recall && transitionMs > 0 ? 'transitioning' : 'holding',
      nextSlotIndex,
      dueAtMs: isRunningRef.current ? now + durationMs : null,
      remainingMs: isRunningRef.current ? null : durationMs,
      transitionStartedAtMs: options.recall && transitionMs > 0 ? now : null,
      transitionEndAtMs: options.recall && transitionMs > 0 ? now + transitionMs : null,
      holdPhrases,
      transitionPhrases: settings.transitionPhrases,
    };

    if (isRunningRef.current) {
      if (options.recall && transitionMs > 0) {
        randomPhaseTimerRef.current = setTimeout(() => {
          randomPhaseTimerRef.current = null;
          randomRuntimeRef.current = {
            ...randomRuntimeRef.current,
            phase: 'holding',
            transitionStartedAtMs: null,
            transitionEndAtMs: null,
          };
          publishSnapshotRef.current();
        }, transitionMs);
      }
      randomSwitchTimerRef.current = setTimeout(() => {
        randomSwitchTimerRef.current = null;
        const latestGroups = muteGroupsRef.current;
        const latestSettings = latestGroups.random ?? normalizeRoutingMuteGroupRandomSettings(undefined);
        if (!latestSettings.enabled || !isRunningRef.current) return;
        const nextIndex = randomRuntimeRef.current.nextSlotIndex
          ?? chooseRandomSlotIndex(latestGroups, latestSettings, activeSlotIndexRef.current);
        if (nextIndex === null) {
          randomRuntimeRef.current = {
            ...EMPTY_RANDOM_RUNTIME,
            phase: 'empty',
            transitionPhrases: latestSettings.transitionPhrases,
          };
          publishSnapshotRef.current();
          return;
        }
        scheduleRandomCycle(nextIndex, { recall: true });
      }, durationMs);
    }

    publishSnapshotRef.current();
  }, [clearRandomTimers, controller, transitionMsForSettings]);

  const pauseRandomCycle = useCallback(() => {
    const settings = muteGroupsRef.current.random ?? normalizeRoutingMuteGroupRandomSettings(undefined);
    if (!settings.enabled) return;
    const runtime = randomRuntimeRef.current;
    const remainingMs = runtime.dueAtMs !== null
      ? Math.max(0, runtime.dueAtMs - Date.now())
      : runtime.remainingMs;
    clearRandomTimers();
    randomRuntimeRef.current = {
      ...runtime,
      phase: 'paused',
      dueAtMs: null,
      remainingMs,
      transitionStartedAtMs: null,
      transitionEndAtMs: null,
      transitionPhrases: settings.transitionPhrases,
    };
    publishSnapshotRef.current();
  }, [clearRandomTimers]);

  const resumeOrStartRandomCycle = useCallback(() => {
    const groups = muteGroupsRef.current;
    const settings = groups.random ?? normalizeRoutingMuteGroupRandomSettings(undefined);
    if (!settings.enabled) return;
    const activeIndex = activeSlotIndexRef.current;
    const activeSlot = activeIndex === null ? null : groups.slots[activeIndex] ?? null;
    const runtime = randomRuntimeRef.current;
    if (activeIndex !== null && activeSlot) {
      scheduleRandomCycle(activeIndex, {
        recall: false,
        durationMs: runtime.phase === 'paused' ? runtime.remainingMs ?? undefined : undefined,
        holdPhrases: runtime.phase === 'paused' ? runtime.holdPhrases : undefined,
      });
      return;
    }

    const nextIndex = chooseRandomSlotIndex(groups, settings, null);
    if (nextIndex === null) {
      clearRandomTimers();
      randomRuntimeRef.current = {
        ...EMPTY_RANDOM_RUNTIME,
        phase: 'empty',
        transitionPhrases: settings.transitionPhrases,
      };
      publishSnapshotRef.current();
      return;
    }
    scheduleRandomCycle(nextIndex, { recall: true });
  }, [clearRandomTimers, scheduleRandomCycle]);

  useEffect(() => () => {
    clearRandomTimers();
    controller.cancel();
  }, [clearRandomTimers, controller]);

  useEffect(() => {
    if (productRuntimeActive) {
      clearRandomTimers();
      controller.cancel();
      return;
    }
    const settings = muteGroupsRef.current.random ?? normalizeRoutingMuteGroupRandomSettings(undefined);
    if (!settings.enabled) {
      clearRandomTimers();
      randomRuntimeRef.current = {
        ...EMPTY_RANDOM_RUNTIME,
        transitionPhrases: settings.transitionPhrases,
      };
      publishSnapshotRef.current();
      return;
    }

    if (!isRunning) {
      pauseRandomCycle();
      return;
    }

    const activeIndex = activeSlotIndexRef.current;
    const activeSlotMissing = activeIndex !== null && !muteGroupsRef.current.slots[activeIndex];
    if (
      randomRuntimeRef.current.phase === 'off'
      || randomRuntimeRef.current.phase === 'empty'
      || randomRuntimeRef.current.phase === 'paused'
      || activeSlotMissing
    ) {
      resumeOrStartRandomCycle();
    } else {
      publishSnapshotRef.current();
    }
  }, [clearRandomTimers, controller, isRunning, pauseRandomCycle, productRuntimeActive, randomEnabled, resumeOrStartRandomCycle]);

  useEffect(() => {
    if (productRuntimeActive || !randomEnabled || typeof window === 'undefined') return undefined;
    const handle = window.setInterval(() => publishSnapshotRef.current(), 250);
    return () => window.clearInterval(handle);
  }, [productRuntimeActive, randomEnabled]);

  useEffect(() => {
    publishSnapshotRef.current();
  }, [activeSlotIndex, publishRuntimeSnapshot, routingMuteGroups, selectedSlotIndex]);

  const selectSlot = useCallback((slotIndex: number) => {
    setSelectedSlotIndex(slotIndex);
  }, [setSelectedSlotIndex]);

  const saveSlot = useCallback((slotIndex: number): SaveSlotResult => {
    const targetSlotIndex = clampSlotIndex(slotIndex);
    const normalizedGroups = normalizeRoutingMuteGroupsState(muteGroupsRef.current);
    const previousSlot = normalizedGroups.slots[targetSlotIndex];
    const wasStored = isRoutingMuteGroupSlotStored(previousSlot);
    const slot = normalizeRoutingMuteGroupSlot(captureRoutingMuteGroupSlot(stateRef.current, {
      effectiveMutedSourceIds: controller.getEffectiveMutedSourceIds(),
      phraseRange: previousSlot?.phraseRange,
    }));
    const nextGroups = setRoutingMuteGroupSlot(normalizedGroups, targetSlotIndex, slot);
    muteGroupsRef.current = nextGroups;
    onRoutingMuteGroupsChangeRef.current(nextGroups);
    // Product re-applies an edited active slot at the next phrase boundary as
    // part of its config commit. The legacy controller has no native commit,
    // so reapply the slot immediately to keep its active state in sync.
    if (!productRuntimeActive && activeSlotIndexRef.current === targetSlotIndex && slot) {
      controller.recall(slot, targetSlotIndex, isRunningRef.current ? undefined : { transitionMs: 0 });
    }
    setSelectedSlotIndex(targetSlotIndex);
    if (
      (nextGroups.random ?? normalizeRoutingMuteGroupRandomSettings(undefined)).enabled
      && isRunningRef.current
      && (randomRuntimeRef.current.phase === 'empty' || randomRuntimeRef.current.phase === 'off')
    ) {
      resumeOrStartRandomCycle();
    }
    return { slotIndex: targetSlotIndex, wasStored };
  }, [controller, productRuntimeActive, resumeOrStartRandomCycle, setSelectedSlotIndex]);

  const pressSlot = useCallback((slotIndex: number) => {
    const targetSlotIndex = clampSlotIndex(slotIndex);
    setSelectedSlotIndex(targetSlotIndex);

    const groups = muteGroupsRef.current;
    const settings = groups.random ?? normalizeRoutingMuteGroupRandomSettings(undefined);
    const slot = groups.slots[targetSlotIndex];
    if (!slot) return;

    if (productRuntimeActive) {
      const sampleRate = productEngine.getTelemetry()?.sampleRate ?? 48_000;
      const transitionFrames = isRunningRef.current
        ? Math.round(transitionMsForSettings(settings) * sampleRate / 1000)
        : 0;
      productEngine.enqueueEvent(createCoreProductRoutingMuteGroupRecallEvent(
        activeSlotIndexRef.current === targetSlotIndex ? null : targetSlotIndex,
        transitionFrames,
      ));
      return;
    }

    if (settings.enabled) {
      if (isRunningRef.current) {
        scheduleRandomCycle(targetSlotIndex, {
          recall: true,
        });
      } else {
        controller.recall(slot, targetSlotIndex, { transitionMs: 0 });
        const slotRange = routingMuteGroupSlotPhraseRange(slot, settings);
        const holdPhrases = randomPhraseCount(slotRange);
        randomRuntimeRef.current = {
          phase: 'paused',
          nextSlotIndex: chooseRandomSlotIndex(groups, settings, targetSlotIndex),
          dueAtMs: null,
          remainingMs: holdPhrases * phraseSecondsRef.current * 1000,
          transitionStartedAtMs: null,
          transitionEndAtMs: null,
          holdPhrases,
          transitionPhrases: settings.transitionPhrases,
        };
        publishSnapshotRef.current();
      }
      return;
    }

    if (activeSlotIndexRef.current === targetSlotIndex) {
      controller.release(isRunningRef.current ? undefined : { transitionMs: 0 });
      return;
    }

    controller.recall(slot, targetSlotIndex, isRunningRef.current ? undefined : { transitionMs: 0 });
  }, [controller, productRuntimeActive, scheduleRandomCycle, setSelectedSlotIndex, transitionMsForSettings]);

  const saveSelectedSlot = useCallback((): SaveSlotResult => (
    saveSlot(selectedSlotIndexRef.current)
  ), [saveSlot]);

  const clearSlot = useCallback((slotIndex: number) => {
    const targetSlotIndex = clampSlotIndex(slotIndex);
    const nextGroups = setRoutingMuteGroupSlot(muteGroupsRef.current, targetSlotIndex, null);
    muteGroupsRef.current = nextGroups;
    onRoutingMuteGroupsChangeRef.current(nextGroups);
    if (activeSlotIndexRef.current === targetSlotIndex) {
      if (productRuntimeActive) {
        productEngine.enqueueEvent(createCoreProductRoutingMuteGroupRecallEvent(null, 0));
      } else {
        controller.release(isRunningRef.current ? undefined : { transitionMs: 0 });
      }
      if ((nextGroups.random ?? normalizeRoutingMuteGroupRandomSettings(undefined)).enabled && isRunningRef.current) {
        randomRuntimeRef.current = { ...EMPTY_RANDOM_RUNTIME };
        resumeOrStartRandomCycle();
      }
    }
    setSelectedSlotIndex(targetSlotIndex);
  }, [controller, productRuntimeActive, resumeOrStartRandomCycle, setSelectedSlotIndex]);

  const clearSelectedSlot = useCallback(() => {
    clearSlot(selectedSlotIndexRef.current);
  }, [clearSlot]);

  const updateSlotPhraseRange = useCallback((slotIndex: number, range: RoutingMuteGroupPhraseRange) => {
    const nextGroups = setRoutingMuteGroupSlotPhraseRange(muteGroupsRef.current, clampSlotIndex(slotIndex), range);
    muteGroupsRef.current = nextGroups;
    onRoutingMuteGroupsChangeRef.current(nextGroups);
  }, []);

  const updateRandomSettings = useCallback((patch: Partial<RoutingMuteGroupRandomSettings>) => {
    const nextGroups = setRoutingMuteGroupRandomSettings(muteGroupsRef.current, patch);
    muteGroupsRef.current = nextGroups;
    onRoutingMuteGroupsChangeRef.current(nextGroups);
  }, []);

  return {
    activeSlotIndex,
    selectedSlotIndex,
    runtimeSnapshot,
    selectSlot,
    pressSlot,
    saveSlot,
    saveSelectedSlot,
    clearSlot,
    clearSelectedSlot,
    updateSlotPhraseRange,
    updateRandomSettings,
  };
}
