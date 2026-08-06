// src/presets/index.ts
// Barrel export for the preset system (Phases 0–2).

// Phase 0: Types & Registry
export type {
  PresetLevel,
  PresetLibrary,
  PresetVisibility,
  PresetVersion,
  PresetVersionMetadata,
  PresetRef,
  PresetEntry,
  PresetFile,
  PresetSaveIdentity,
  PresetSummary,
  PresetVariantSummary,
  PresetFamilySummary,
  JourneyPresetPreview,
  JourneyPresetPreviewConnection,
  JourneyPresetPreviewNode,
} from './types';
export { PARAM_REGISTRY, type ParamLevel } from './ParamRegistry';
export { extractParams, applyParams, getKeysForScope, getScopesForLevel, validateRegistry, extractCascade, compressVersions, getVersionData } from './codec';
export {
  generatePresetId,
  makePresetKey,
  parsePresetKey,
  getPresetScope,
  normalizePresetEntry,
  normalizePresetVersion,
  extractPresetVersionMetadata,
  isPresetCompatibleWithSlot,
  comparePresetVersions,
} from './presetUtils';
export {
  CURRENT_PRESET_SCHEMA,
  UnsupportedPresetVersionError,
  decodeCurrentPresetEntry,
  isCurrentPresetEntry,
} from './currentPresetSchema';
export { buildPresetFamilies, getPresetDisplayLabel } from './catalog';
export {
  buildPresetVersionMetadata,
  preparePresetVersionMetadataForV2Storage,
  sanitizePresetParameterBehaviorMetadata,
} from './versionMetadataHelpers';

// Phase 1: PresetStore
export type { IPresetStore } from './PresetStore';
export { LocalStoragePresetStore, getPresetStore, setPresetStore } from './PresetStore';
export { SupabasePresetStore } from './SupabasePresetStore';
export { HybridPresetStore } from './HybridPresetStore';
export { loadFactoryPresets, isFactoryLoaded } from './factoryPresets';
export {
  optimizeStringWavesV2,
  repairPresetChildGraphsV2,
  repairPresetChildGraphsV2ForClient,
  repairStringWavesGraphV2,
  repairStringWavesGraphV2ForClient,
  runPresetV2Migration,
  verifyPresetV2Migration,
} from './presetV2Migration';
export type {
  PresetV2MigrationOptions,
  PresetV2MigrationReport,
  PresetChildGraphRepairReport,
  PresetChildGraphRepairScope,
  StringWavesGraphRepairReport,
  StringWavesOptimizationReport,
} from './presetV2Migration';
export { usePresets } from './usePresets';
export type { UsePresetsOptions } from './usePresets';
export { useJourneyPresets } from './useJourneyPresets';
export type { LoadedJourneyPreset, UseJourneyPresetsResult } from './useJourneyPresets';
export {
  JOURNEY_PRESET_FORMAT_VERSION,
  JOURNEY_STATE_PRESET_SCOPE,
  decodeJourneyPresetData,
  encodeJourneyPresetData,
  getFilledJourneyPositions,
  getJourneyNodeRefSlot,
  getJourneyNodePositionFromRefSlot,
  removeStatePresetRefFromJourneyData,
  validateJourneyConfig,
} from './journeyPresetCodec';
export type {
  JourneyValidationResult,
  SerializedJourneyConnection,
  SerializedJourneyNode,
  SerializedJourneyPresetData,
} from './journeyPresetCodec';
export {
  cleanupJourneyRefsForDeletedStatePreset,
  findJourneyPresetsReferencingStatePreset,
} from './journeyPresetReferences';
export type {
  CleanupJourneyReferencesResult,
  JourneyReferenceImpact,
} from './journeyPresetReferences';

// Phase 2: File I/O
export { exportPresetToFile, importPresetFromFile, quickExport } from './fileIO';

// Phase 3: PresetDropdown component
export { PresetDropdown } from './PresetDropdown';
export type { PresetDropdownProps } from './PresetDropdown';
export { PresetRatingStars } from './PresetRatingStars';
export type { PresetRatingStarsProps } from './PresetRatingStars';

// Family tree visualizer
export { PresetFamilyTree } from './PresetFamilyTree';
export type { PresetFamilyTreeProps } from './PresetFamilyTree';
