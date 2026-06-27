import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import type { RoutingMuteGroupRuntimeLevelPatch } from '../ui/routing';
import type { SliderState } from '../ui/state';
import type { ProductRuntimeParamUpdateOptions } from '../ui/useProductRuntimePresetSurface';

type ProductRuntimeParamUpdateScheduler = (
  state: SliderState,
  options?: ProductRuntimeParamUpdateOptions,
) => void;

type ScheduledHandle =
  | { kind: 'frame'; id: number }
  | { kind: 'timeout'; id: number };

interface RoutingMuteGroupRuntimeLevelSyncOptions {
  stateRef: MutableRefObject<SliderState>;
  scheduleProductRuntimeParamUpdate: ProductRuntimeParamUpdateScheduler;
}

export function useRoutingMuteGroupRuntimeLevelSync({
  stateRef,
  scheduleProductRuntimeParamUpdate,
}: RoutingMuteGroupRuntimeLevelSyncOptions) {
  const runtimeLevelsRef = useRef<Partial<Record<keyof SliderState, number>>>({});
  const syncHandleRef = useRef<ScheduledHandle | null>(null);

  const applyRoutingMuteGroupRuntimeLevels = useCallback((sourceState: SliderState): SliderState => {
    const runtimeLevels = runtimeLevelsRef.current;
    return Object.keys(runtimeLevels).length > 0
      ? ({ ...sourceState, ...runtimeLevels } as SliderState)
      : sourceState;
  }, []);

  const flushRuntimeLevelPatch = useCallback(() => {
    syncHandleRef.current = null;
    scheduleProductRuntimeParamUpdate(applyRoutingMuteGroupRuntimeLevels(stateRef.current), {
      immediate: true,
      reason: 'ui-control-change',
    });
  }, [applyRoutingMuteGroupRuntimeLevels, scheduleProductRuntimeParamUpdate, stateRef]);

  const scheduleRuntimeLevelFlush = useCallback(() => {
    if (syncHandleRef.current) return;
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      syncHandleRef.current = {
        kind: 'frame',
        id: window.requestAnimationFrame(flushRuntimeLevelPatch),
      };
      return;
    }
    if (typeof window !== 'undefined') {
      syncHandleRef.current = {
        kind: 'timeout',
        id: window.setTimeout(flushRuntimeLevelPatch, 0),
      };
    } else {
      flushRuntimeLevelPatch();
    }
  }, [flushRuntimeLevelPatch]);

  const handleRoutingMuteGroupRuntimeLevelPatchChange = useCallback((patch: RoutingMuteGroupRuntimeLevelPatch) => {
    const nextRuntimeLevels = { ...runtimeLevelsRef.current };
    let changed = false;

    for (const [rawKey, value] of Object.entries(patch)) {
      const key = rawKey as keyof SliderState;
      if (value === null) {
        if (Object.prototype.hasOwnProperty.call(nextRuntimeLevels, key)) {
          delete nextRuntimeLevels[key];
          changed = true;
        }
      } else if (Number.isFinite(value) && nextRuntimeLevels[key] !== value) {
        nextRuntimeLevels[key] = value;
        changed = true;
      }
    }

    if (!changed) return;
    runtimeLevelsRef.current = nextRuntimeLevels;
    scheduleRuntimeLevelFlush();
  }, [scheduleRuntimeLevelFlush]);

  useEffect(() => () => {
    const handle = syncHandleRef.current;
    if (!handle || typeof window === 'undefined') return;
    if (handle.kind === 'frame') {
      window.cancelAnimationFrame(handle.id);
    } else {
      window.clearTimeout(handle.id);
    }
    syncHandleRef.current = null;
  }, []);

  return {
    applyRoutingMuteGroupRuntimeLevels,
    handleRoutingMuteGroupRuntimeLevelPatchChange,
  };
}
