/**
 * Snowflake V2 — Main Hook (SVG Generator + Dynamic Arm Assignment)
 *
 * Arms are dynamically assigned from the top active engines.
 * Inactive engines don't get arms. Mirrors fill empty hex slots for symmetry.
 * Star interaction: pointer over/touch handle → opens FX send star.
 */

import { useMemo, useCallback, useState, useRef } from 'react';
import { quantize, type SliderMode, type SliderState } from '../state';
import {
  computeArmAssignments,
  getActiveEngineSignature,
  getRankedActiveEngineIds,
  type EngineGroupDef,
  type ArmAssignment,
} from './engineGroups';
import { computeArmMacros, type ArmMacros } from './macros';
import { buildArmParams } from './armParams';
import { generateSnowflake } from '../../snowflake/SnowflakeGenerator';
import type { SnowflakeParams, GeneratedSnowflake } from '../../snowflake/types';

export interface ArmSnowflake {
  engine: EngineGroupDef;
  normalizedLevel: number;
  macros: ArmMacros;
  params: SnowflakeParams;
  generated: GeneratedSnowflake;
  /** Which hex slot (0-5) this arm occupies */
  slot: number;
  /** Whether this is a faint mirror of another arm */
  isMirror: boolean;
}

export type StarDirection = 'reverb' | 'delayA' | 'delayB' | 'granular' | 'degrade';

export interface StarState {
  isOpen: boolean;
  activePoint: StarDirection | null;
}

export interface SnowflakeV2State {
  /** Per-arm generated snowflakes (dynamic — only active engines + mirrors) */
  arms: ArmSnowflake[];
  /** Which slot index is currently being level-dragged */
  draggingArm: number | null;
  /** Star visibility + active point per slot (always 6 entries) */
  stars: StarState[];
  /** Level drag callbacks */
  onLevelNodePointerEnter: (slot: number) => void;
  onLevelNodePointerLeave: (slot: number) => void;
  onLevelDragStart: (slot: number, e: React.PointerEvent) => void;
  onLevelDrag: (clientX: number, clientY: number, centerX: number, centerY: number, maxArmLength: number, scaleFactor: number) => void;
  onLevelDragEnd: () => void;
  /** Star drag callbacks */
  onStarPointPointerDown: (slot: number, direction: StarDirection, clientX: number, clientY: number) => void;
  onStarDrag: (clientX: number, clientY: number, scaleFactor: number) => void;
  onStarDragEnd: () => void;
}

const AUTO_CLOSE_MS = 3000;
const RANGE_EPSILON = 0.000001;
const LEVEL_DRAG_REACH_SPAN = 0.56;

let persistedAssignmentSignature: string | null = null;
let persistedAssignmentOrder: string[] = [];

type DualRange = {
  min: number;
  max: number;
};

type LevelRangeMacro = {
  key: keyof SliderState;
  sourceRange: DualRange;
  minValue: number;
  maxValue: number;
};

type SnowflakeV2Options = {
  sliderModes?: Record<string, SliderMode>;
  dualSliderRanges?: Partial<Record<keyof SliderState, DualRange | undefined>>;
  onDualRangeChange?: (key: keyof SliderState, min: number, max: number) => void;
};

function getNormalizedLevel(engine: EngineGroupDef, state: SliderState): number {
  const value = state[engine.levelKey] as number;
  const range = engine.levelMax - engine.levelMin;
  if (range <= 0) return 0;
  return Math.max(0, Math.min(1, (value - engine.levelMin) / range));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeDualRange(range: DualRange, minValue: number, maxValue: number): DualRange {
  const min = clamp(Math.min(range.min, range.max), minValue, maxValue);
  const max = clamp(Math.max(range.min, range.max), minValue, maxValue);
  return { min, max };
}

function computeRangeMacro(sourceRange: DualRange, targetMidpoint: number, minValue: number, maxValue: number): DualRange {
  const source = normalizeDualRange(sourceRange, minValue, maxValue);
  const sourceWidth = source.max - source.min;
  if (sourceWidth <= RANGE_EPSILON) {
    const value = clamp(targetMidpoint, minValue, maxValue);
    return { min: value, max: value };
  }

  const sourceMidpoint = (source.min + source.max) * 0.5;
  const nextMidpoint = clamp(targetMidpoint, minValue, maxValue);

  if (nextMidpoint < sourceMidpoint) {
    const scale = clamp(
      (nextMidpoint - minValue) / Math.max(RANGE_EPSILON, sourceMidpoint - minValue),
      0,
      1,
    );
    return {
      min: minValue + (source.min - minValue) * scale,
      max: minValue + (source.max - minValue) * scale,
    };
  }

  const halfWidth = sourceWidth * 0.5;
  const shiftedMidpoint = clamp(nextMidpoint, minValue + halfWidth, maxValue - halfWidth);
  return {
    min: shiftedMidpoint - halfWidth,
    max: shiftedMidpoint + halfWidth,
  };
}

/**
 * Build a fingerprint string from the arm assignments to detect when the
 * set of active engines or their positions change.
 */
function getAssignmentsFingerprint(assignments: (ArmAssignment | null)[]): string {
  return assignments.map((a) => {
    if (!a) return 'x';
    const lv = ((a.normalizedLevel * 100) | 0);
    return `${a.engine.id}:${lv}:${a.isMirror ? 'm' : 'r'}`;
  }).join('|');
}

function refreshAssignmentLevels(
  assignments: (ArmAssignment | null)[],
  state: SliderState,
): (ArmAssignment | null)[] {
  return assignments.map((assignment) => {
    if (!assignment) return null;
    return {
      ...assignment,
      normalizedLevel: getNormalizedLevel(assignment.engine, state),
    };
  });
}

/**
 * Build a fine-grained fingerprint for a single engine's macro inputs.
 */
function getEngineFingerprint(engine: EngineGroupDef, state: SliderState): string {
  const lv = ((state[engine.levelKey] as number) * 100) | 0;
  const rv = ((state.reverbLevel as number) * 100) | 0;
  const rs = engine.sends.reverb ? ((state[engine.sends.reverb] as number) * 100) | 0 : 0;
  const gr = engine.sends.granular ? ((state[engine.sends.granular] as number) * 100) | 0 : 0;
  const da = engine.sends.delayA ? ((state[engine.sends.delayA] as number) * 100) | 0 : 0;
  const db = engine.sends.delayB ? ((state[engine.sends.delayB] as number) * 100) | 0 : 0;
  const dg = engine.sends.degrade ? ((state[engine.sends.degrade] as number) * 100) | 0 : 0;
  const rd = ((state.reverbDecay as number) * 20) | 0;
  const rdf = ((state.reverbDiffusion as number) * 20) | 0;
  const gm = state.granularV1Mode === 'granular' ? 1 : 0;
  return `${lv}.${rv}.${rs}.${gr}.${da}.${db}.${dg}.${rd}.${rdf}.${gm}`;
}

export function useSnowflakeV2(
  state: SliderState,
  onChange: (key: keyof SliderState, value: number) => void,
  options: SnowflakeV2Options = {},
): SnowflakeV2State {
  const {
    sliderModes,
    dualSliderRanges,
    onDualRangeChange,
  } = options;
  const [draggingArm, setDraggingArm] = useState<number | null>(null);
  const [stars, setStars] = useState<StarState[]>(() =>
    Array.from({ length: 6 }, () => ({ isOpen: false, activePoint: null }))
  );
  const armRenderCacheRef = useRef(new Map<string, {
    macros: ArmMacros;
    params: SnowflakeParams;
    generated: GeneratedSnowflake;
  }>());
  const rememberedLevelRangesRef = useRef<Record<string, DualRange>>({});
  const dragStateRef = useRef<{
    slot: number;
    engine: EngineGroupDef | null;
    levelRangeMacro: LevelRangeMacro | null;
    frozenAssignments: (ArmAssignment | null)[];
    startX: number;
    startY: number;
    startNormalizedLevel: number;
    confirmed: boolean;
  } | null>(null);

  // --- Dynamic arm assignment: rank once per active-set change, then keep slots stable while levels move ---
  const activeEngineSignature = getActiveEngineSignature(state);
  const frozenAssignmentSnapshot = dragStateRef.current?.frozenAssignments ?? null;
  const isLevelDragInProgress = frozenAssignmentSnapshot !== null;
  if (!isLevelDragInProgress && persistedAssignmentSignature !== activeEngineSignature) {
    persistedAssignmentSignature = activeEngineSignature;
    persistedAssignmentOrder = getRankedActiveEngineIds(state).slice(0, 6);
  }
  const assignedEngineOrder = persistedAssignmentOrder;
  const assignments = useMemo(() => {
    if (frozenAssignmentSnapshot) {
      return refreshAssignmentLevels(frozenAssignmentSnapshot, state);
    }
    return computeArmAssignments(state, assignedEngineOrder);
  }, [state, assignedEngineOrder, frozenAssignmentSnapshot]);

  // Build a combined fingerprint that includes assignment layout + per-engine state
  const combinedFp = useMemo(() => {
    const assignFp = getAssignmentsFingerprint(assignments);
    const engineFps = assignments
      .filter((a): a is ArmAssignment => a !== null)
      .map((a) => getEngineFingerprint(a.engine, state))
      .join(',');
    return `${assignFp}||${engineFps}`;
  }, [assignments, state]);

  // Generate arms from assignments — memoized on the combined fingerprint
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const arms: ArmSnowflake[] = useMemo(() => {
    const result: ArmSnowflake[] = [];
    for (let slot = 0; slot < 6; slot++) {
      const assignment = assignments[slot];
      if (!assignment) continue;

      const { engine, isMirror } = assignment;
      const renderCacheKey = `${engine.id}:${getEngineFingerprint(engine, state)}`;
      let renderState = armRenderCacheRef.current.get(renderCacheKey);
      if (!renderState) {
        const macros = computeArmMacros(engine, state);
        const seed = 10000 + engine.id.charCodeAt(0) * 137 + engine.id.charCodeAt(1) * 31;
        const params = buildArmParams(macros, engine, seed);
        const generated = generateSnowflake(params);
        renderState = { macros, params, generated };
        if (armRenderCacheRef.current.size > 256) armRenderCacheRef.current.clear();
        armRenderCacheRef.current.set(renderCacheKey, renderState);
      }
      const normalizedLevel = getNormalizedLevel(engine, state);

      result.push({ engine, normalizedLevel, ...renderState, slot, isMirror });
    }
    return result;
  }, [combinedFp]);

  // --- Level drag + Star open/auto-close timer ---
  const closeTimersRef = useRef<Array<ReturnType<typeof setTimeout> | null>>(Array.from({ length: 6 }, () => null));
  const starDragRef = useRef<{
    slot: number;
    direction: StarDirection;
    startX: number;
    startY: number;
    startValue: number;
  } | null>(null);

  // Keep a ref to current arms so callbacks can look up engines by slot
  const armsRef = useRef(arms);
  armsRef.current = arms;

  const getEngineForSlot = useCallback((slot: number): EngineGroupDef | null => {
    const arm = armsRef.current.find((a) => a.slot === slot);
    return arm?.engine ?? null;
  }, []);

  const getLevelRangeMacro = useCallback((engine: EngineGroupDef | null): LevelRangeMacro | null => {
    if (!engine || !onDualRangeChange) return null;
    const key = engine.levelKey;
    const keyString = String(key);
    const mode = sliderModes?.[keyString] ?? 'single';
    if (mode === 'single') return null;

    const currentRange = dualSliderRanges?.[key];
    if (!currentRange) return null;

    const normalized = normalizeDualRange(currentRange, engine.levelMin, engine.levelMax);
    if (normalized.max - normalized.min > RANGE_EPSILON) {
      rememberedLevelRangesRef.current[keyString] = normalized;
    }
    const sourceRange = normalized.max - normalized.min > RANGE_EPSILON
      ? normalized
      : rememberedLevelRangesRef.current[keyString] ?? normalized;

    return {
      key,
      sourceRange,
      minValue: engine.levelMin,
      maxValue: engine.levelMax,
    };
  }, [dualSliderRanges, onDualRangeChange, sliderModes]);

  const clearCloseTimer = useCallback((slot: number) => {
    const timer = closeTimersRef.current[slot];
    if (timer) { clearTimeout(timer); closeTimersRef.current[slot] = null; }
  }, []);

  const scheduleAutoClose = useCallback((slot: number) => {
    clearCloseTimer(slot);
    closeTimersRef.current[slot] = setTimeout(() => {
      setStars((prev) => prev.map((star, idx) =>
        idx === slot ? { isOpen: false, activePoint: null } : star
      ));
      closeTimersRef.current[slot] = null;
    }, AUTO_CLOSE_MS);
  }, [clearCloseTimer]);

  const openStarForSlot = useCallback((slot: number) => {
    clearCloseTimer(slot);
    setStars((prev) => prev.map((star, idx) => ({
      isOpen: idx === slot,
      activePoint: idx === slot ? star.activePoint : null,
    })));
  }, [clearCloseTimer]);

  const onLevelNodePointerEnter = useCallback((slot: number) => {
    openStarForSlot(slot);
  }, [openStarForSlot]);

  const onLevelNodePointerLeave = useCallback((slot: number) => {
    scheduleAutoClose(slot);
  }, [scheduleAutoClose]);

  const onLevelDragStart = useCallback((slot: number, e: React.PointerEvent) => {
    const rect = (e.currentTarget as SVGElement).ownerSVGElement?.getBoundingClientRect();
    const x = rect ? e.clientX - rect.left : e.clientX;
    const y = rect ? e.clientY - rect.top : e.clientY;
    const engine = getEngineForSlot(slot);
    dragStateRef.current = {
      slot,
      engine,
      levelRangeMacro: getLevelRangeMacro(engine),
      frozenAssignments: assignments.map((assignment) => assignment ? { ...assignment } : null),
      startX: x,
      startY: y,
      startNormalizedLevel: engine ? getNormalizedLevel(engine, state) : 0,
      confirmed: false,
    };

    openStarForSlot(slot);
  }, [assignments, openStarForSlot, getEngineForSlot, getLevelRangeMacro, state]);

  const onLevelDrag = useCallback((
    clientX: number, clientY: number,
    centerX: number, centerY: number,
    maxArmLength: number, scaleFactor: number,
  ) => {
    const ds = dragStateRef.current;
    if (!ds) return;

    if (!ds.confirmed) {
      const dx = clientX - ds.startX;
      const dy = clientY - ds.startY;
      if (Math.sqrt(dx * dx + dy * dy) < 5) return;
      ds.confirmed = true;
      setDraggingArm(ds.slot);
    }

    const engine = ds.engine ?? getEngineForSlot(ds.slot);
    if (!engine) return;

    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const innerGap = 30 * scaleFactor;
    if (maxArmLength <= 0) return;
    const startDistance = Math.sqrt(
      (ds.startX - centerX) * (ds.startX - centerX)
      + (ds.startY - centerY) * (ds.startY - centerY),
    );
    const startReach = (startDistance - innerGap) / maxArmLength;
    const reach = (distance - innerGap) / maxArmLength;
    const normalizedLevel = clamp(ds.startNormalizedLevel + (reach - startReach) / LEVEL_DRAG_REACH_SPAN, 0, 1);
    const value = engine.levelMin + normalizedLevel * (engine.levelMax - engine.levelMin);
    if (ds.levelRangeMacro && onDualRangeChange) {
      const nextRange = computeRangeMacro(
        ds.levelRangeMacro.sourceRange,
        value,
        ds.levelRangeMacro.minValue,
        ds.levelRangeMacro.maxValue,
      );
      const nextMin = quantize(ds.levelRangeMacro.key, nextRange.min);
      const nextMax = quantize(ds.levelRangeMacro.key, nextRange.max);
      const sortedMin = Math.min(nextMin, nextMax);
      const sortedMax = Math.max(nextMin, nextMax);
      onDualRangeChange(ds.levelRangeMacro.key, sortedMin, sortedMax);
      onChange(ds.levelRangeMacro.key, quantize(ds.levelRangeMacro.key, (sortedMin + sortedMax) * 0.5));
      return;
    }
    onChange(engine.levelKey, value);
  }, [onChange, onDualRangeChange, getEngineForSlot]);

  const onLevelDragEnd = useCallback(() => {
    if (dragStateRef.current) {
      scheduleAutoClose(dragStateRef.current.slot);
    }
    dragStateRef.current = null;
    setDraggingArm(null);
  }, [scheduleAutoClose]);

  const onStarPointPointerDown = useCallback((slot: number, direction: StarDirection, clientX: number, clientY: number) => {
    const engine = getEngineForSlot(slot);
    if (!engine) return;
    const sendKey = engine.sends[direction];
    if (!sendKey) return;

    clearCloseTimer(slot);
    const startValue = (state[sendKey] as number) ?? 0;
    starDragRef.current = { slot, direction, startX: clientX, startY: clientY, startValue };
    setStars((prev) => prev.map((star, idx) =>
      idx === slot ? { isOpen: true, activePoint: direction } : star
    ));
  }, [clearCloseTimer, state, getEngineForSlot]);

  const onStarDrag = useCallback((clientX: number, clientY: number, scaleFactor: number) => {
    const drag = starDragRef.current;
    if (!drag) return;

    const engine = getEngineForSlot(drag.slot);
    if (!engine) return;
    const sendKey = engine.sends[drag.direction];
    if (!sendKey) return;

    // Project pointer delta onto the star direction axis
    const dir = drag.direction === 'reverb' ? { x: 0, y: -1 }
      : drag.direction === 'delayB' ? { x: 0.9511, y: -0.309 }
      : drag.direction === 'granular' ? { x: 0.5878, y: 0.809 }
      : drag.direction === 'degrade' ? { x: -0.5878, y: 0.809 }
      : { x: -0.9511, y: -0.309 }; // delayA
    const deltaX = clientX - drag.startX;
    const deltaY = clientY - drag.startY;
    const projection = deltaX * dir.x + deltaY * dir.y;
    const sensitivity = Math.max(36, 64 * scaleFactor);
    const nextValue = Math.max(0, Math.min(1, drag.startValue + projection / sensitivity));
    onChange(sendKey, nextValue);
  }, [onChange, getEngineForSlot]);

  const onStarDragEnd = useCallback(() => {
    const drag = starDragRef.current;
    if (drag) {
      setStars((prev) => prev.map((star, idx) =>
        idx === drag.slot ? { ...star, activePoint: null } : star
      ));
      scheduleAutoClose(drag.slot);
    }
    starDragRef.current = null;
  }, [scheduleAutoClose]);

  return {
    arms,
    draggingArm,
    stars,
    onLevelNodePointerEnter,
    onLevelNodePointerLeave,
    onLevelDragStart,
    onLevelDrag,
    onLevelDragEnd,
    onStarPointPointerDown,
    onStarDrag,
    onStarDragEnd,
  };
}
