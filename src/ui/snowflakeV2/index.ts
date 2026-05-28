/**
 * Snowflake V2 — Barrel Export
 *
 * Macro-driven snowflake using the SVG generator.
 * 4 macros (Ornament, Fractal, Density, Structure) drive all visual variation.
 */

export { ENGINE_GROUPS, computeArmAssignments, getSendValue, FX_COLORS } from './engineGroups';
export type { EngineGroupDef, ArmAssignment, EngineSendKeys } from './engineGroups';

export { computeArmMacros } from './macros';
export type { ArmMacros } from './macros';

export { buildArmParams } from './armParams';

export { useSnowflakeV2 } from './useSnowflakeV2';
export type { SnowflakeV2State, ArmSnowflake, StarDirection, StarState } from './useSnowflakeV2';
