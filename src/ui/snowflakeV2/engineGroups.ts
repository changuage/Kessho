/**
 * Snowflake V2 — Engine Group Definitions & Arm Assignment
 *
 * Engine groups project the arm-eligible source rows from the routing registry.
 * Degrade/Reverb return rows stay in the routing matrix but not in Snowflake arms.
 * The top 6 active groups (enabled + level > 0) are assigned to snowflake arms.
 */

import type { SliderState } from '../state';
import { ROUTING_ACTIVE_EPSILON, ROUTING_SOURCE_REGISTRY, type RoutingRowId, type RoutingSourceDef } from '../routing';
import type { SnowflakeFamily } from '../../snowflake/types';

/** FX send keys for a given engine row (matches routing matrix columns) */
export interface EngineSendKeys {
  delayA?: keyof SliderState | null;
  delayB?: keyof SliderState | null;
  granular?: keyof SliderState | null;
  degrade?: keyof SliderState | null;
  reverb?: keyof SliderState | null;
}

/** Defines one arm-eligible engine source */
export interface EngineGroupDef {
  id: RoutingRowId;
  label: string;
  color: string;
  /** The key that controls this source's output level */
  levelKey: keyof SliderState;
  /** Level range — used for normalization */
  levelMin: number;
  levelMax: number;
  /** How to determine if this source is active (enabled + audible) */
  enabledKey: keyof SliderState | null; // null = always enabled (e.g. delay outputs)
  isEnabled?: (state: SliderState) => boolean;
  /** FX send keys matching routing matrix columns */
  sends: EngineSendKeys;
  /** Visual identity: snowflake family used for this engine's arm shape */
  family: SnowflakeFamily;
}

const SNOWFLAKE_FAMILY_BY_ROW_ID = {
  pad1: "stellarPlate",
  pad2: "stellarPlate",
  lead1: "thinSharpCrystal",
  lead2: "thinSharpCrystal",
  sample1: "classicDendrite",
  sample2: "thinSharpCrystal",
  drums: "simpleSpoke",
  granular: "denseFractal",
  waves: "hexPlate",
  water: "roundedIcon",
  insects: "fernDendrite",
  nature: "roundedIcon",
  delayAOut: "ringedCrystal",
  delayBOut: "ringedCrystal",
  degrade: "ringedCrystal",
  reverb: "classicDendrite",
} as const satisfies Record<RoutingRowId, SnowflakeFamily>;

export const SNOWFLAKE_RETURN_ROW_POLICY = "Degrade and Reverb return rows are routing matrix rows, but they are not Snowflake arm-eligible source rows.";

function engineGroupFromRoutingSource(row: RoutingSourceDef): EngineGroupDef {
  return {
    id: row.id,
    label: row.label,
    color: row.accent,
    levelKey: row.levelKey,
    levelMin: 0,
    levelMax: 1,
    enabledKey: row.enabledKeys?.[0] ?? null,
    isEnabled: row.isEnabled,
    sends: {
      delayA: row.sends.delayA ?? null,
      delayB: row.sends.delayB ?? null,
      granular: row.sends.granular ?? null,
      degrade: row.sends.degrade ?? null,
      reverb: row.sends.reverb ?? null,
    },
    family: SNOWFLAKE_FAMILY_BY_ROW_ID[row.id],
  };
}

/**
 * Arm-eligible source rows projected from the central routing registry.
 * Return rows are intentionally excluded; see SNOWFLAKE_RETURN_ROW_POLICY.
 */
export const ENGINE_GROUPS: EngineGroupDef[] = ROUTING_SOURCE_REGISTRY
  .filter((row) => row.snowflakeArmEligible)
  .map(engineGroupFromRoutingSource);

/** A resolved arm assignment for one snowflake arm slot */
export interface ArmAssignment {
  engine: EngineGroupDef;
  /** Normalized level 0-1 (for arm length) */
  normalizedLevel: number;
  /** Whether this is a mirror of another arm (faint visual) */
  isMirror: boolean;
  /** If mirror, which arm index it mirrors */
  mirrorsIndex?: number;
}

/** Check if an engine source is active (enabled AND level > threshold) */
function isEngineActive(engine: EngineGroupDef, state: SliderState): boolean {
  const enabled = engine.isEnabled
    ? engine.isEnabled(state)
    : engine.enabledKey
      ? Boolean(state[engine.enabledKey])
      : true;
  const level = Number(state[engine.levelKey] ?? 0);
  return enabled && Number.isFinite(level) && level > ROUTING_ACTIVE_EPSILON;
}

/** Get normalized level (0-1) for an engine */
function getNormalizedLevel(engine: EngineGroupDef, state: SliderState): number {
  const value = state[engine.levelKey] as number;
  const range = engine.levelMax - engine.levelMin;
  if (range <= 0) return 0;
  return Math.max(0, Math.min(1, (value - engine.levelMin) / range));
}

/** Active engine ids in fixed source order. Used to detect true on/off changes. */
export function getActiveEngineSignature(state: SliderState): string {
  return ENGINE_GROUPS
    .filter(engine => isEngineActive(engine, state))
    .map(engine => engine.id)
    .join('|');
}

/** Active engine ids ranked by current level. Used only when assigning a fresh layout. */
export function getRankedActiveEngineIds(state: SliderState): string[] {
  return ENGINE_GROUPS
    .filter(engine => isEngineActive(engine, state))
    .map(engine => ({
      engine,
      normalizedLevel: getNormalizedLevel(engine, state),
    }))
    .sort((a, b) => b.normalizedLevel - a.normalizedLevel)
    .map(entry => entry.engine.id);
}

/**
 * Compute optimal hex positions for N active arms on a 6-slot grid.
 * Returns array of slot indices (0-5) for active arms, maximizing spacing.
 */
function computeOptimalSlots(activeCount: number): number[] {
  switch (activeCount) {
    case 6: return [0, 1, 2, 3, 4, 5];
    case 5: return [0, 1, 2, 4, 5]; // skip slot 3 so its mirror reflects the strongest arm at slot 0
    case 4: return [0, 1, 3, 4];    // skip 2 and 5 (across from each other)
    case 3: return [0, 2, 4];       // every other (120° apart)
    case 2: return [0, 3];          // opposite (180° apart)
    case 1: return [0];
    default: return [];
  }
}

/**
 * Compute which slots are empty and whether they should show mirrors.
 * Returns map of slotIndex → mirroredArmIndex (or -1 for empty stub).
 */
function computeMirrorSlots(activeCount: number, activeSlots: number[]): Map<number, number> {
  const allSlots = [0, 1, 2, 3, 4, 5];
  const emptySlots = allSlots.filter(s => !activeSlots.includes(s));
  const mirrorMap = new Map<number, number>();

  switch (activeCount) {
    case 5: {
      // 1 empty slot mirrors the arm across from it
      const emptySlot = emptySlots[0]!;
      const acrossSlot = (emptySlot + 3) % 6;
      const acrossArmIndex = activeSlots.indexOf(acrossSlot);
      mirrorMap.set(emptySlot, acrossArmIndex >= 0 ? acrossArmIndex : 0);
      break;
    }
    case 3: {
      // 3 empty slots each mirror the arm across
      for (const emptySlot of emptySlots) {
        const acrossSlot = (emptySlot + 3) % 6;
        const acrossArmIndex = activeSlots.indexOf(acrossSlot);
        mirrorMap.set(emptySlot, acrossArmIndex >= 0 ? acrossArmIndex : 0);
      }
      break;
    }
    case 1: {
      // 1 mirror (across from the real arm), rest empty
      const realSlot = activeSlots[0]!;
      const mirrorSlot = (realSlot + 3) % 6;
      mirrorMap.set(mirrorSlot, 0); // mirrors arm index 0
      // Other 4 slots: -1 = empty stub (no mirror)
      for (const slot of emptySlots) {
        if (slot !== mirrorSlot) mirrorMap.set(slot, -1);
      }
      break;
    }
    default: {
      // 6, 4, 2: empty slots are just empty (no mirrors)
      for (const slot of emptySlots) {
        mirrorMap.set(slot, -1);
      }
      break;
    }
  }

  return mirrorMap;
}

/**
 * Compute the 6 arm assignments from current state.
 * Returns array of 6 entries (one per hex slot), some may be null (empty).
 */
export function computeArmAssignments(
  state: SliderState,
  preferredEngineOrder?: readonly string[],
): (ArmAssignment | null)[] {
  // 1. Find all active engines. The preferred order is captured when the
  // active engine set changes, so live level drags do not reshuffle slots.
  const active = ENGINE_GROUPS
    .filter(engine => isEngineActive(engine, state))
    .map(engine => ({
      engine,
      normalizedLevel: getNormalizedLevel(engine, state),
    }));

  const activeById = new Map<string, { engine: EngineGroupDef; normalizedLevel: number }>(
    active.map(entry => [entry.engine.id, entry]),
  );
  const orderedActive = preferredEngineOrder
    ? preferredEngineOrder
        .map(id => activeById.get(id))
        .filter((entry): entry is { engine: EngineGroupDef; normalizedLevel: number } => entry !== undefined)
    : [];
  const orderedIds = new Set(orderedActive.map(entry => entry.engine.id));
  const newlyActive = active
    .filter(entry => !orderedIds.has(entry.engine.id))
    .sort((a, b) => b.normalizedLevel - a.normalizedLevel);

  // 2. Take top 6
  const topActive = (orderedActive.length > 0 ? [...orderedActive, ...newlyActive] : newlyActive).slice(0, 6);
  const activeCount = topActive.length;

  // 3. Compute optimal slot positions
  const activeSlots = computeOptimalSlots(activeCount);

  // 4. Compute mirror/empty slots
  const mirrorMap = computeMirrorSlots(activeCount, activeSlots);

  // 5. Build the 6-slot array
  const assignments: (ArmAssignment | null)[] = [null, null, null, null, null, null];

  // Place active arms
  for (let i = 0; i < topActive.length; i++) {
    const slot = activeSlots[i]!;
    assignments[slot] = {
      engine: topActive[i]!.engine,
      normalizedLevel: topActive[i]!.normalizedLevel,
      isMirror: false,
    };
  }

  // Place mirrors
  for (const [slot, mirroredArmIndex] of mirrorMap) {
    if (mirroredArmIndex >= 0 && mirroredArmIndex < topActive.length) {
      assignments[slot] = {
        engine: topActive[mirroredArmIndex]!.engine,
        normalizedLevel: topActive[mirroredArmIndex]!.normalizedLevel,
        isMirror: true,
        mirrorsIndex: activeSlots[mirroredArmIndex],
      };
    }
    // else: slot stays null (empty stub)
  }

  return assignments;
}

/**
 * Get the send value for a specific FX direction.
 * Returns 0 if the send key is null (self-routing or blocked).
 */
export function getSendValue(
  engine: EngineGroupDef,
  direction: 'delayA' | 'delayB' | 'granular' | 'degrade' | 'reverb',
  state: SliderState,
): number {
  const key = engine.sends[direction];
  if (key == null) return 0;
  return (state[key] as number) ?? 0;
}

/** FX destination colors */
export const FX_COLORS = {
  reverb: '#D49660',
  delayA: '#32C8C8',
  delayB: '#32C7C7',
  granular: '#E8B44A',
  degrade: '#A980FF',
} as const;
