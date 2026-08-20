// src/presets/PresetFamilyTree.tsx
// Visualizer for a parent preset and its children (max 1 level, max 10 children).
// Children share the parent's familyId but have distinct variantName + description.

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { PresetFamilySummary, PresetLevel, PresetEntry, PresetRenameIdentity, PresetSummary, PresetSaveIdentity, PresetVersionMetadata } from './types';
import { usePresets } from './usePresets';
import { getVersionData } from './codec';
import { extractCascade } from './codec';
import { getPresetCommandErrorMessage } from './presetCommands';
import { PRESET_DELETE_ENABLED, SHARED_PRESET_TEST_MODE } from './sharedMode';
import { PresetRatingStars } from './PresetRatingStars';
import { PresetTagEditor } from './PresetTagEditor';
import type { SliderState } from '../ui/state';
import type { SliderMode } from '../ui/state';
import { buildPresetVersionMetadata, getPresetVersionSnapshot } from './versionMetadataHelpers';
import { blurSelectAfterChange } from '../ui/shared/selectFocus';
import { getPresetVersionDiffKeys, getSemanticPresetDiffKeys } from './presetDiffSemantics';

const MAX_CHILDREN = 10;
const FAMILY_TREE_SELECTION_STORAGE_PREFIX = 'preset-family-tree:selected:';

type SlotLoadResult = boolean | void | Promise<boolean | void>;

function surfacePresetMutationFailure(message: string): void {
  if (typeof window !== 'undefined' && typeof window.alert === 'function') {
    window.alert(message);
  } else {
    console.warn(message);
  }
}

function getFamilyTreeSelectionStorageKey(level: PresetLevel, scope?: string): string {
  return `${FAMILY_TREE_SELECTION_STORAGE_PREFIX}${level}:${scope ?? 'global'}`;
}

function normalizePresetName(name: string): string {
  return name.trim().toLowerCase();
}

function dedupePresetSummaries(presets: PresetSummary[]): PresetSummary[] {
  const byKey = new Map<string, PresetSummary>();
  for (const preset of presets) {
    const key = normalizePresetName(preset.name);
    const existing = byKey.get(key);
    const existingRank = existing?.library === 'cloud' ? 3 : existing?.library === 'user' ? 2 : 1;
    const presetRank = preset.library === 'cloud' ? 3 : preset.library === 'user' ? 2 : 1;
    if (!existing || presetRank > existingRank || (presetRank === existingRank && (preset.updatedAt ?? 0) > (existing.updatedAt ?? 0))) {
      byKey.set(key, preset);
    }
  }
  return Array.from(byKey.values());
}

function getFamilyParentPreset(family: PresetFamilySummary): PresetSummary | null {
  return (
    family.variants.find((preset) => preset.name === family.familyName)
    ?? family.variants.find((preset) => preset.variantName === family.familyName)
    ?? family.variants.find((preset) => preset.variantRank === 0)
    ?? family.variants[0]
    ?? null
  );
}

export interface PresetFamilyTreeProps {
  level: PresetLevel;
  scope?: string;
  state: SliderState;
  /** Currently loaded preset name */
  currentName?: string;
  /** Load preset into morph Slot A */
  onLoadSlotA: (entry: PresetEntry, data: Record<string, unknown>) => SlotLoadResult;
  /** Load preset into morph Slot B */
  onLoadSlotB: (entry: PresetEntry, data: Record<string, unknown>) => SlotLoadResult;
  /** Current slider modes (which params are in walk/sampleHold) */
  sliderModes?: Record<string, SliderMode>;
  /** Current dual slider ranges for walk/sampleHold params */
  dualSliderRanges?: Record<string, { min: number; max: number }>;
  /** Optional callback to supply current live metadata when saving a state preset */
  getSaveMetadata?: () => PresetVersionMetadata | undefined;
  /** Optional custom state extractor used when saving */
  customExtract?: (state: SliderState) => Record<string, unknown>;
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const treeStyles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
  },
  selectorRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  select: {
    flex: 1,
    minWidth: 0,
    fontSize: '0.75rem',
    background: 'rgba(0, 0, 0, 0.3)',
    color: '#ccc',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: 4,
    padding: '3px 6px',
    cursor: 'pointer',
    colorScheme: 'dark' as const,
  },
  btn: {
    background: 'none',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    borderRadius: 4,
    color: '#999',
    cursor: 'pointer',
    padding: '2px 6px',
    fontSize: '0.7rem',
    lineHeight: 1,
    transition: 'color 0.15s, border-color 0.15s',
    flexShrink: 0,
  },
  slotBtn: {
    background: 'none',
    borderWidth: 1,
    borderStyle: 'solid' as const,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 3,
    cursor: 'pointer',
    padding: '3px 8px',
    fontSize: '0.6rem',
    fontWeight: 700 as const,
    lineHeight: 1.2,
    transition: 'color 0.15s, border-color 0.15s, background 0.15s',
    flexShrink: 0,
    minWidth: 26,
    minHeight: 22,
    textAlign: 'center' as const,
  },
  saveBtn: {
    background: 'none',
    borderWidth: 1,
    borderStyle: 'solid' as const,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 3,
    cursor: 'pointer',
    padding: '3px 6px',
    fontSize: '0.6rem',
    lineHeight: 1.2,
    transition: 'color 0.15s, border-color 0.15s, background 0.15s',
    flexShrink: 0,
    minWidth: 26,
    minHeight: 22,
    color: '#5f8f5f',
  },
  deleteBtn: {
    background: 'none',
    borderWidth: 1,
    borderStyle: 'solid' as const,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 3,
    cursor: 'pointer',
    padding: '3px 6px',
    fontSize: '0.6rem',
    lineHeight: 1.2,
    transition: 'color 0.15s, border-color 0.15s, background 0.15s',
    flexShrink: 0,
    minWidth: 26,
    minHeight: 22,
    color: '#8f5f5f',
  },
  expandBtn: {
    background: 'none',
    borderWidth: 1,
    borderStyle: 'solid' as const,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 3,
    cursor: 'pointer',
    padding: '2px 5px',
    fontSize: '0.55rem',
    lineHeight: 1,
    color: '#888',
    transition: 'color 0.15s, border-color 0.15s',
    flexShrink: 0,
  },
  versionRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 4,
    padding: '3px 0',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
  },
  versionLabel: {
    fontSize: '0.6rem',
    color: '#888',
    fontWeight: 600 as const,
    minWidth: 18,
    flexShrink: 0,
  },
  versionDiff: {
    fontSize: '0.55rem',
    color: '#777',
    flex: 1,
    minWidth: 0,
    lineHeight: 1.3,
  },
  versionPanel: {
    marginTop: 4,
    marginLeft: 14,
    padding: '4px 8px',
    background: 'rgba(0,0,0,0.15)',
    borderRadius: 4,
    borderLeft: '2px solid rgba(255,255,255,0.06)',
  },
  filterToggle: {
    background: 'none',
    borderWidth: 1,
    borderStyle: 'solid' as const,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 4,
    cursor: 'pointer',
    padding: '3px 6px',
    fontSize: '0.65rem',
    lineHeight: 1,
    color: '#888',
    transition: 'color 0.15s, border-color 0.15s',
    flexShrink: 0,
    whiteSpace: 'nowrap' as const,
  },
  confirmOverlay: {
    position: 'fixed' as const,
    top: 0, left: 0, right: 0, bottom: 0,
    padding: 12,
    background: 'rgba(0,0,0,0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
  },
  confirmBox: {
    background: '#171615',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: 8,
    padding: '16px 20px',
    width: 'min(360px, calc(100vw - 24px))',
    minWidth: 'min(260px, calc(100vw - 24px))',
    maxWidth: 'calc(100vw - 24px)',
    textAlign: 'center' as const,
    boxSizing: 'border-box' as const,
  },
  confirmText: {
    color: '#ccc',
    fontSize: '0.85rem',
    marginBottom: 14,
  },
  confirmBtnRow: {
    display: 'flex',
    justifyContent: 'center',
    gap: 12,
  },
  confirmBtnCancel: {
    padding: '8px 20px',
    borderRadius: 4,
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.85rem',
    background: 'rgba(255,255,255,0.08)',
    color: '#999',
    minWidth: 60,
  },
  confirmBtnOk: {
    padding: '8px 20px',
    borderRadius: 4,
    border: '1px solid rgba(184,224,255,0.34)',
    cursor: 'pointer',
    fontSize: '0.85rem',
    background: 'rgba(184,224,255,0.14)',
    color: '#B8E0FF',
    minWidth: 60,
  },
  slotA: {
    color: '#7eb8d0',
    borderColor: 'rgba(126,184,208,0.3)',
  },
  slotB: {
    color: '#d0a87e',
    borderColor: 'rgba(208,168,126,0.3)',
  },
  treeBox: {
    background: 'rgba(0,0,0,0.2)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 6,
    padding: '10px 12px',
  },
  parentRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginBottom: 0,
  },
  parentName: {
    fontSize: '0.8rem',
    fontWeight: 700 as const,
    color: '#a5c4d4',
    flex: 1,
    minWidth: 0,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
    whiteSpace: 'nowrap' as const,
  },
  childrenContainer: {
    marginLeft: 16,
    borderLeft: '1px solid rgba(255,255,255,0.1)',
    paddingLeft: 10,
    marginTop: 6,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 3,
  },
  childRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  childBranch: {
    color: 'rgba(255,255,255,0.15)',
    fontSize: '0.65rem',
    userSelect: 'none' as const,
  },
  childName: {
    fontSize: '0.75rem',
    color: '#b0b0b0',
    flex: 1,
    minWidth: 0,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
    whiteSpace: 'nowrap' as const,
  },
  addChildBtn: {
    background: 'none',
    border: '1px dashed rgba(255,255,255,0.15)',
    borderRadius: 4,
    color: '#777',
    cursor: 'pointer',
    padding: '3px 8px',
    fontSize: '0.7rem',
    marginTop: 4,
    transition: 'color 0.15s, border-color 0.15s',
  },
  emptyText: {
    fontSize: '0.7rem',
    color: '#666',
    fontStyle: 'italic' as const,
  },
  // Tooltip
  tooltip: {
    position: 'fixed' as const,
    background: '#171615',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: 6,
    padding: '6px 10px',
    fontSize: '0.7rem',
    color: '#ccc',
    maxWidth: 260,
    zIndex: 10000,
    pointerEvents: 'none' as const,
    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
  },
  // Save child dialog
  overlay: {
    position: 'fixed' as const,
    top: 0, left: 0, right: 0, bottom: 0,
    padding: 12,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  dialog: {
    background: '#171615',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 8,
    padding: 16,
    width: 'min(420px, calc(100vw - 24px))',
    minWidth: 'min(300px, calc(100vw - 24px))',
    maxWidth: 'calc(100vw - 24px)',
    maxHeight: 'min(80dvh, 640px)',
    overflowY: 'auto' as const,
    boxSizing: 'border-box' as const,
  },
  dialogTitle: {
    color: '#a5c4d4',
    fontSize: '0.9rem',
    marginBottom: 12,
    fontWeight: 600,
  },
  input: {
    width: '100%',
    padding: 8,
    borderRadius: 4,
    border: '1px solid rgba(255,255,255,0.2)',
    background: 'rgba(0,0,0,0.3)',
    color: 'white',
    fontSize: '0.85rem',
    marginBottom: 8,
    boxSizing: 'border-box' as const,
  },
  dialogBtnRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginTop: 8,
    gap: 8,
  },
  dialogBtn: {
    padding: '6px 16px',
    borderRadius: 4,
    border: '1px solid rgba(244,237,228,0.12)',
    cursor: 'pointer',
    fontSize: '0.8rem',
    fontWeight: 700,
  },
  parentLabel: {
    fontSize: '0.7rem',
    color: '#777',
    marginBottom: 4,
  },
};

// ─── Component ──────────────────────────────────────────────────────────────

export const PresetFamilyTree: React.FC<PresetFamilyTreeProps> = ({
  level,
  scope,
  state,
  currentName,
  onLoadSlotA,
  onLoadSlotB,
  sliderModes,
  dualSliderRanges,
  getSaveMetadata,
  customExtract,
}) => {
  const presetOptions = useMemo(
    () => (customExtract ? { customExtract } : undefined),
    [customExtract],
  );
  const { presets, families, save, load, loadById, remove, rename, updateMetadata } = usePresets(level, scope, presetOptions);
  const selectionStorageKey = useMemo(() => getFamilyTreeSelectionStorageKey(level, scope), [level, scope]);

  // Optimistic local rating state (keyed by preset name)
  const [localRatings, setLocalRatings] = useState<Record<string, number>>({});
  const handleRate = useCallback(async (name: string, r: number) => {
    const previousRating = localRatings[name];
    setLocalRatings(prev => ({ ...prev, [name]: r }));
    try {
      const updated = await updateMetadata(name, { rating: r });
      if (!updated) throw new Error(`Rating for preset "${name}" was not updated.`);
    } catch (ratingError) {
      setLocalRatings(prev => {
        const next = { ...prev };
        if (previousRating === undefined) delete next[name];
        else next[name] = previousRating;
        return next;
      });
      surfacePresetMutationFailure(getPresetCommandErrorMessage(ratingError));
    }
  }, [localRatings, updateMetadata]);

  // Selected parent preset (for viewing the tree — does NOT auto-load)
  const [selectedParentName, setSelectedParentName] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    try {
      return window.sessionStorage.getItem(getFamilyTreeSelectionStorageKey(level, scope)) ?? '';
    } catch {
      return '';
    }
  });

  // Filter toggle: 'parents' = parent only, 'all' = parent + children
  const [filterMode, setFilterMode] = useState<'parents' | 'all'>('parents');

  // Version expand state: which preset names are expanded to show versions
  const [expandedVersions, setExpandedVersions] = useState<Set<string>>(new Set());
  // Loaded version data for expanded presets
  const [versionEntries, setVersionEntries] = useState<Record<string, PresetEntry>>({});

  // Save child dialog
  const [showChildDialog, setShowChildDialog] = useState(false);
  const [childModifier, setChildModifier] = useState('');
  const [childDescription, setChildDescription] = useState('');
  const [childTags, setChildTags] = useState<string[]>([]);

  // Confirmation dialog
  const [confirmAction, setConfirmAction] = useState<{
    message: string;
    onConfirm: () => void;
  } | null>(null);

  // Save dialog (Save / Save As)
  const [saveDialog, setSaveDialog] = useState<{
    originalName: string;
    isChild: boolean;          // whether the preset is a child (has parent)
    parentName?: string;       // parent name if it's a child
  } | null>(null);
  const [saveAsName, setSaveAsName] = useState('');
  const [saveTags, setSaveTags] = useState<string[]>([]);
  const [saveError, setSaveError] = useState('');
  const [saveBusy, setSaveBusy] = useState(false);

  // Tooltip
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (selectedParentName) {
        window.sessionStorage.setItem(selectionStorageKey, selectedParentName);
      } else {
        window.sessionStorage.removeItem(selectionStorageKey);
      }
    } catch {
      // Ignore storage failures; selection can remain in-memory.
    }
  }, [selectionStorageKey, selectedParentName]);

  // Find parent presets (those that are NOT children — i.e. familyName === name or no siblings)
  const parentPresets = useMemo(() => {
    return families
      .map(getFamilyParentPreset)
      .filter((preset): preset is PresetSummary => !!preset);
  }, [families]);

  // The selected family
  const selectedFamily = useMemo(() => {
    if (!selectedParentName) return null;
    const parent = parentPresets.find(p => p.name === selectedParentName) ?? presets.find(p => p.name === selectedParentName);
    if (!parent) return null;
    return families.find(f => f.familyId === parent.familyId) ?? null;
  }, [selectedParentName, parentPresets, presets, families]);

  // Children of the selected parent (variants that are NOT the parent itself)
  const children = useMemo(() => {
    if (!selectedFamily) return [];
    return selectedFamily.variants.filter(v => v.name !== selectedParentName);
  }, [selectedFamily, selectedParentName]);

  const currentPresetParentName = useMemo(() => {
    if (!currentName) return '';

    if (parentPresets.some(p => p.name === currentName)) {
      return currentName;
    }

    const preset = presets.find(p => p.name === currentName);
    if (!preset) return '';

    const family = families.find(f => f.familyId === preset.familyId);
    if (!family) return '';

    const parent = getFamilyParentPreset(family);
    return parent?.name ?? family.variants[0]?.name ?? '';
  }, [currentName, parentPresets, presets, families]);

  // Filtered dropdown options based on filterMode
  const dropdownPresets = useMemo(() => {
    if (filterMode === 'parents') return parentPresets;
    // 'all' — return all presets (parents + children)
    return presets;
  }, [filterMode, parentPresets, presets]);

  const dedupedDropdownPresets = useMemo(
    () => dedupePresetSummaries(dropdownPresets),
    [dropdownPresets],
  );
  const sortedDropdownPresets = useMemo(
    () => [...dedupedDropdownPresets].sort((left, right) => left.name.localeCompare(right.name)),
    [dedupedDropdownPresets],
  );
  const tagSuggestions = useMemo(() => {
    const tags = new Set<string>();
    for (const preset of presets) {
      for (const tag of preset.tags ?? []) tags.add(tag);
    }
    return [...tags].sort((left, right) => left.localeCompare(right));
  }, [presets]);

  const getCurrentSaveMetadata = useCallback((): PresetVersionMetadata | undefined => {
    if (getSaveMetadata) return getSaveMetadata();
    return buildPresetVersionMetadata({
      dualRanges: dualSliderRanges,
      sliderModes,
    });
  }, [getSaveMetadata, dualSliderRanges, sliderModes]);

  // Load preset data and call a slot callback (with confirmation)
  const requestLoadToSlot = useCallback((
    name: string,
    slot: 'A' | 'B',
    slotCb: (entry: PresetEntry, data: Record<string, unknown>) => SlotLoadResult,
  ) => {
    setConfirmAction({
      message: `Load "${name}" to Slot ${slot}?`,
      onConfirm: async () => {
        try {
          const summary = parentPresets.find(p => p.name === name) ?? presets.find(p => p.name === name);
          const entry = summary?.id ? await loadById(summary.id) : await load(name);
          if (!entry) {
            surfacePresetMutationFailure(`Preset "${name}" could not be loaded.`);
            return;
          }
          const data = getVersionData(entry);
          if (!data) {
            surfacePresetMutationFailure(`Preset "${name}" has no loadable version data.`);
            return;
          }
          const loaded = await slotCb(entry, data);
          if (loaded === false) return;
        } catch (error) {
          surfacePresetMutationFailure(getPresetCommandErrorMessage(error));
        }
      },
    });
  }, [load, loadById, parentPresets, presets]);

  // Save preset — opens save dialog with Save / Save As options
  const requestSave = useCallback((name: string) => {
    // Determine if this preset is a child
    const preset = presets.find(p => p.name === name);
    const isChild = !!(preset && preset.variantName !== preset.familyName);
    const parentName = isChild ? preset?.familyName : undefined;
    setSaveAsName('');
    setSaveTags(preset?.tags ?? []);
    setSaveError('');
    setSaveDialog({ originalName: name, isChild, parentName });
  }, [presets]);

  // Execute save (overwrite)
  const handleSaveOverwrite = useCallback(async () => {
    if (!saveDialog) return;
    setSaveError('');
    setSaveBusy(true);
    try {
      const saveMeta = getCurrentSaveMetadata();
      const updated = await save(saveDialog.originalName, state, undefined, saveTags, saveMeta, undefined);
      if (!updated) {
        setSaveError(`Preset "${saveDialog.originalName}" was not saved.`);
        return;
      }
      setVersionEntries(prev => ({ ...prev, [saveDialog.originalName]: updated }));
      setSaveDialog(null);
    } catch (error) {
      setSaveError(getPresetCommandErrorMessage(error));
    } finally {
      setSaveBusy(false);
    }
  }, [saveDialog, save, saveTags, state, getCurrentSaveMetadata]);

  const handleRename = useCallback(async () => {
    if (!saveDialog || !saveAsName.trim()) return;
    const nextLabel = saveAsName.trim();
    const targetName = saveDialog.isChild && saveDialog.parentName
      ? `${saveDialog.parentName} · ${nextLabel}`
      : nextLabel;
    if (targetName === saveDialog.originalName) return;

    const identity: PresetRenameIdentity | undefined = saveDialog.isChild && saveDialog.parentName
      ? {
        familyName: saveDialog.parentName,
        variantName: nextLabel,
        tags: saveTags,
      }
      : { tags: saveTags };
    setSaveError('');
    setSaveBusy(true);
    try {
      const renamed = await rename(saveDialog.originalName, targetName, identity);
      if (!renamed) {
        setSaveError(`Preset "${saveDialog.originalName}" was not renamed.`);
        return;
      }
      setVersionEntries(prev => {
        const next = { ...prev };
        const cached = next[saveDialog.originalName];
        delete next[saveDialog.originalName];
        if (cached) next[renamed.name] = { ...cached, name: renamed.name };
        return next;
      });
      setExpandedVersions(prev => {
        const next = new Set(prev);
        if (next.delete(saveDialog.originalName)) next.add(renamed.name);
        return next;
      });
      setSelectedParentName(saveDialog.isChild && saveDialog.parentName ? saveDialog.parentName : renamed.name);
      setSaveDialog(null);
    } catch (error) {
      setSaveError(getPresetCommandErrorMessage(error));
    } finally {
      setSaveBusy(false);
    }
  }, [saveDialog, saveAsName, saveTags, rename]);

  // Actual save-as logic (extracted so confirm can call it too)
  const doSaveAs = useCallback(async (
    dialog: { originalName: string; isChild: boolean; parentName?: string },
    newName: string,
    targetName: string,
  ) => {
    setSaveError('');
    setSaveBusy(true);
    try {
      const saveMeta = getCurrentSaveMetadata();
      let updated: PresetEntry | null;

      if (dialog.isChild && dialog.parentName) {
        const parentEntry = await load(dialog.parentName);
        if (!parentEntry) {
          throw new Error(`Parent preset "${dialog.parentName}" could not be loaded.`);
        }
        const parentFamilyId = parentEntry.familyId
          ?? `${level}:${scope ?? 'global'}:${dialog.parentName.toLowerCase().replace(/\s+/g, '-')}`;
        const parentFamilyName = parentEntry.familyName ?? dialog.parentName;
        const identity: PresetSaveIdentity = {
          familyId: parentFamilyId,
          familyName: parentFamilyName,
          variantName: newName,
        };
        updated = await save(targetName, state, undefined, saveTags, saveMeta, identity);
      } else {
        updated = await save(targetName, state, undefined, saveTags, saveMeta, undefined);
      }

      if (!updated) {
        setSaveDialog(dialog);
        setSaveError(`Preset "${targetName}" was not saved.`);
        return;
      }
      setVersionEntries(prev => ({ ...prev, [targetName]: updated }));

      setSaveDialog(null);

      // Auto-select the new preset in the dropdown
      setSelectedParentName(dialog.isChild && dialog.parentName ? dialog.parentName : targetName);
    } catch (error) {
      console.error('Failed to save preset:', error);
      setSaveError(getPresetCommandErrorMessage(error));
    } finally {
      setSaveBusy(false);
    }
  }, [save, saveTags, load, state, level, scope, getCurrentSaveMetadata]);

  // Execute save as
  const handleSaveAs = useCallback(async () => {
    if (!saveDialog || !saveAsName.trim()) return;
    const newName = saveAsName.trim();

    let targetName = newName;
    if (saveDialog.isChild && saveDialog.parentName) {
      targetName = `${saveDialog.parentName} · ${newName}`;
    }

    // Check for existing preset with the same name
    const existing = presets.find(p => p.name === targetName);
    if (existing) {
      // Close save dialog and ask for overwrite confirmation
      setSaveDialog(null);
      setConfirmAction({
        message: `A preset named "${targetName}" already exists. Overwrite?`,
        onConfirm: async () => {
          await doSaveAs(saveDialog, newName, targetName);
        },
      });
      return;
    }

    await doSaveAs(saveDialog, newName, targetName);
  }, [saveDialog, saveAsName, presets, doSaveAs]);

  // Delete preset (with confirmation)
  const requestDelete = useCallback((name: string) => {
    setConfirmAction({
      message: `Delete "${name}"?`,
      onConfirm: async () => {
        const removed = await remove(name);
        if (!removed) {
          surfacePresetMutationFailure(`Preset "${name}" could not be deleted.`);
          return;
        }
        if (selectedParentName === name) setSelectedParentName('');
      },
    });
  }, [remove, selectedParentName]);

  // Select parent from dropdown (no auto-load — just show tree)
  const handleSelectParent = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedParentName(e.target.value);
    blurSelectAfterChange(e.currentTarget);
  }, []);

  // Open save-child dialog
  const handleOpenChildDialog = useCallback(() => {
    setChildModifier('');
    setChildDescription('');
    setChildTags(presets.find(preset => preset.name === selectedParentName)?.tags ?? []);
    setSaveError('');
    setShowChildDialog(true);
  }, [presets, selectedParentName]);

  // Save child
  const handleSaveChild = useCallback(async () => {
    if (!childModifier.trim() || !selectedParentName) return;

    setSaveError('');
    setSaveBusy(true);
    try {
      const parentEntry = await load(selectedParentName);
      if (!parentEntry) throw new Error(`Parent preset "${selectedParentName}" could not be loaded.`);

      const parentFamilyId = parentEntry.familyId
        ?? `${level}:${scope ?? 'global'}:${selectedParentName.toLowerCase().replace(/\s+/g, '-')}`;
      const parentFamilyName = parentEntry.familyName ?? selectedParentName;
      const childName = `${selectedParentName} · ${childModifier.trim()}`;
      const identity: PresetSaveIdentity = {
        familyId: parentFamilyId,
        familyName: parentFamilyName,
        variantName: childModifier.trim(),
        description: childDescription.trim() || undefined,
      };
      const saveMeta = getCurrentSaveMetadata();
      const updated = await save(childName, state, undefined, childTags, saveMeta, identity);
      if (!updated) {
        setSaveError(`Preset "${childName}" was not saved.`);
        return;
      }
      setVersionEntries(prev => ({ ...prev, [childName]: updated }));
      setShowChildDialog(false);
    } catch (error) {
      setSaveError(getPresetCommandErrorMessage(error));
    } finally {
      setSaveBusy(false);
    }
  }, [childModifier, childDescription, childTags, selectedParentName, load, save, state, level, scope, getCurrentSaveMetadata]);

  // Update (resave) — now goes through confirmation
  const handleUpdateChild = useCallback((name: string) => {
    requestSave(name);
  }, [requestSave]);

  // ─── Version expand logic ─────────────────────────────────────────────
  const toggleVersionExpand = useCallback(async (name: string) => {
    setExpandedVersions(prev => {
      const next = new Set(prev);
      if (next.has(name)) { next.delete(name); return next; }
      next.add(name);
      return next;
    });
    // Load entry if not already cached
    if (!versionEntries[name]) {
      const entry = await load(name);
      if (entry) setVersionEntries(prev => ({ ...prev, [name]: entry }));
    }
  }, [load, versionEntries]);

  // Load a specific version into a slot
  const requestLoadVersion = useCallback((
    name: string,
    versionNum: number,
    slot: 'A' | 'B',
    slotCb: (entry: PresetEntry, data: Record<string, unknown>) => SlotLoadResult,
  ) => {
    setConfirmAction({
      message: `Load "${name}" v${versionNum} to Slot ${slot}?`,
      onConfirm: async () => {
        const entry = versionEntries[name] || await load(name);
        if (!entry) return;
        const data = getVersionData(entry, versionNum);
        if (!data) return;
        await slotCb({ ...entry, currentVersion: versionNum }, data);
      },
    });
  }, [load, versionEntries]);

  // Promote a version: save its data as a new top version
  const requestPromoteVersion = useCallback((name: string, versionNum: number) => {
    setConfirmAction({
      message: `Restore v${versionNum} of "${name}" as latest?`,
      onConfirm: async () => {
        const entry = versionEntries[name] || await load(name);
        if (!entry) return;
        const snapshot = getPresetVersionSnapshot(entry, versionNum);
        if (!snapshot) return;
        // Save the selected version's full snapshot and metadata as the new latest version.
        const updated = await save(name, snapshot.data as unknown as SliderState, undefined, undefined, snapshot.metadata, undefined);
        if (updated) setVersionEntries(prev => ({ ...prev, [name]: updated }));
      },
    });
  }, [load, save, versionEntries]);

  // Helper: humanize a camelCase param key
  const humanize = useCallback((key: string) => {
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, s => s.toUpperCase())
      .trim();
  }, []);

  // Helper: get diff summary for a version vs v1 and vs previous version
  const getVersionDiffs = useCallback((entry: PresetEntry, versionNum: number): {
    fromV1: string[];
    fromPrev: string[];
  } => {
    const sorted = [...entry.versions].sort((a, b) => a.v - b.v);
    const targetIdx = sorted.findIndex(v => v.v === versionNum);
    if (targetIdx < 0) return { fromV1: [], fromPrev: [] };

    const v1 = sorted[0];
    const prev = targetIdx > 0 ? sorted[targetIdx - 1] : null;
    const fromV1 = v1 ? getPresetVersionDiffKeys(entry, v1.v, versionNum).map(humanize) : [];
    const fromPrev = prev ? getPresetVersionDiffKeys(entry, prev.v, versionNum).map(humanize) : [];

    return { fromV1, fromPrev };
  }, [humanize]);

  // Render version panel for a preset
  const renderVersionPanel = useCallback((name: string) => {
    const entry = versionEntries[name];
    if (!entry || !expandedVersions.has(name)) return null;

    const sorted = [...entry.versions].sort((a, b) => a.v - b.v);
    // Show last 3 versions (most recent)
    const shown = sorted.slice(-3);

    // "Current" snapshot: live state as preset data (not saved)
    const paramLevel = level === 'state' ? 4 : level === 'source' ? 3 : level === 'kit' ? 2 : 1;
    const currentData = extractCascade(state, paramLevel as 1 | 2 | 3 | 4, scope);
    const latestVer = sorted[sorted.length - 1];
    const latestSaved = latestVer ? getVersionData(entry, latestVer.v) : null;
    const currentDiffKeys = latestVer && latestSaved
      ? getSemanticPresetDiffKeys(
        entry,
        { data: currentData, metadata: { sliderModes, dualRanges: dualSliderRanges } },
        { data: latestSaved, metadata: latestVer },
      ).map(humanize)
      : [];

    return (
      <div style={treeStyles.versionPanel}>
        {shown.map(ver => {
          const diffs = ver.v > 1 ? getVersionDiffs(entry, ver.v) : null;
          return (
            <div key={ver.v} style={treeStyles.versionRow}>
              <span style={treeStyles.versionLabel}>v{ver.v}</span>
              <div style={treeStyles.versionDiff}>
                {ver.v === 1 && <span style={{ color: '#666' }}>base</span>}
                {diffs && diffs.fromPrev.length > 0 && (
                  <div>
                    <span style={{ color: '#666' }}>vs prev: </span>
                    {diffs.fromPrev.slice(0, 5).join(', ')}
                    {diffs.fromPrev.length > 5 && ` +${diffs.fromPrev.length - 5}`}
                  </div>
                )}
                {diffs && diffs.fromV1.length > 0 && (
                  <div>
                    <span style={{ color: '#555' }}>vs v1: </span>
                    {diffs.fromV1.slice(0, 5).join(', ')}
                    {diffs.fromV1.length > 5 && ` +${diffs.fromV1.length - 5}`}
                  </div>
                )}
              </div>
              <button
                style={{ ...treeStyles.slotBtn, ...treeStyles.slotA, padding: '1px 4px', minWidth: 18, minHeight: 16, fontSize: '0.5rem' }}
                onClick={() => requestLoadVersion(name, ver.v, 'A', onLoadSlotA)}
                title={`Load v${ver.v} \u2192 Slot A`}
              >A</button>
              <button
                style={{ ...treeStyles.slotBtn, ...treeStyles.slotB, padding: '1px 4px', minWidth: 18, minHeight: 16, fontSize: '0.5rem' }}
                onClick={() => requestLoadVersion(name, ver.v, 'B', onLoadSlotB)}
                title={`Load v${ver.v} \u2192 Slot B`}
              >B</button>
              {ver.v > 1 && (
                <button
                  style={{ ...treeStyles.expandBtn, fontSize: '0.5rem' }}
                  onClick={() => requestPromoteVersion(name, ver.v)}
                  title={`Restore v${ver.v} as latest`}
                >\u2191</button>
              )}
            </div>
          );
        })}
        {sorted.length > 3 && (
          <div style={{ fontSize: '0.55rem', color: '#555', marginTop: 2 }}>
            {sorted.length} versions total (showing last 3)
          </div>
        )}
        {/* Current (unsaved live state) */}
        <div style={{ ...treeStyles.versionRow, borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 2, paddingTop: 4 }}>
          <span style={{ ...treeStyles.versionLabel, color: '#a5c4d4', fontStyle: 'italic' }}>now</span>
          <div style={treeStyles.versionDiff}>
            {currentDiffKeys.length === 0
              ? <span style={{ color: '#555' }}>no changes</span>
              : (
                <div>
                  <span style={{ color: '#666' }}>vs saved: </span>
                  {currentDiffKeys.slice(0, 5).join(', ')}
                  {currentDiffKeys.length > 5 && ` +${currentDiffKeys.length - 5}`}
                </div>
              )
            }
          </div>
          <button
            style={{ ...treeStyles.slotBtn, ...treeStyles.slotA, padding: '1px 4px', minWidth: 18, minHeight: 16, fontSize: '0.5rem' }}
            onClick={() => {
              setConfirmAction({
                message: `Load current live state of "${name}" to Slot A?`,
                onConfirm: () => {
                  const mockEntry: PresetEntry = { ...entry, currentVersion: entry.currentVersion };
                  onLoadSlotA(mockEntry, currentData);
                },
              });
            }}
            title="Load current live state \u2192 Slot A"
          >A</button>
          <button
            style={{ ...treeStyles.slotBtn, ...treeStyles.slotB, padding: '1px 4px', minWidth: 18, minHeight: 16, fontSize: '0.5rem' }}
            onClick={() => {
              setConfirmAction({
                message: `Load current live state of "${name}" to Slot B?`,
                onConfirm: () => {
                  const mockEntry: PresetEntry = { ...entry, currentVersion: entry.currentVersion };
                  onLoadSlotB(mockEntry, currentData);
                },
              });
            }}
            title="Load current live state \u2192 Slot B"
          >B</button>
        </div>
      </div>
    );
  }, [versionEntries, expandedVersions, getVersionDiffs, requestLoadVersion, requestPromoteVersion, onLoadSlotA, onLoadSlotB, state, level, scope, humanize, sliderModes, dualSliderRanges]);

  // Tooltip handlers
  const handleChildMouseEnter = useCallback((e: React.MouseEvent, description: string) => {
    if (!description) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({ text: description, x: rect.left, y: rect.bottom + 4 });
  }, []);
  const handleChildMouseLeave = useCallback(() => setTooltip(null), []);

  const lastSyncedCurrentNameRef = useRef<string | undefined>(undefined);

  // Auto-select parent when the actually loaded preset changes.
  useEffect(() => {
    if (!currentName || !currentPresetParentName || lastSyncedCurrentNameRef.current === currentName) return;
    lastSyncedCurrentNameRef.current = currentName;
    if (currentPresetParentName !== selectedParentName) {
      setSelectedParentName(currentPresetParentName);
    }
  }, [currentName, currentPresetParentName, selectedParentName]);

  const handleConfirmOk = useCallback(() => {
    if (confirmAction) {
      confirmAction.onConfirm();
      setConfirmAction(null);
    }
  }, [confirmAction]);
  const handleConfirmCancel = useCallback(() => setConfirmAction(null), []);

  return (
    <>
      <div style={treeStyles.container}>
        {/* Parent selector dropdown + filter toggle */}
        <div style={treeStyles.selectorRow}>
          <select
            value={selectedParentName}
            onChange={handleSelectParent}
            style={treeStyles.select}
            title="Select preset"
          >
            <option value="">— Select Preset —</option>
            {sortedDropdownPresets.map(p => (
              <option key={`${p.library}:${p.name}`} value={p.name}>{p.name}</option>
            ))}
          </select>
          <button
            style={{
              ...treeStyles.filterToggle,
              ...(filterMode === 'all' ? { color: '#a5c4d4', borderColor: 'rgba(165,196,212,0.3)' } : {}),
            }}
            onClick={() => setFilterMode(prev => prev === 'parents' ? 'all' : 'parents')}
            title={filterMode === 'parents' ? 'Showing parents only — click to include children' : 'Showing all — click for parents only'}
          >
            {filterMode === 'parents' ? 'Parents' : 'All'}
          </button>
        </div>

        {/* Tree visualizer */}
        {selectedParentName && (
          <div style={treeStyles.treeBox}>
            {/* Parent node */}
            <div style={treeStyles.parentRow}>
              <span style={{ color: '#a5c4d4', fontSize: '0.7rem' }}>◆</span>
              <span style={treeStyles.parentName}>
                {selectedParentName}
              </span>
              <button
                style={{ ...treeStyles.expandBtn, ...(expandedVersions.has(selectedParentName) ? { color: '#a5c4d4' } : {}) }}
                onClick={() => toggleVersionExpand(selectedParentName)}
                title="Show version history"
              >+</button>
              <button
                style={{ ...treeStyles.slotBtn, ...treeStyles.slotA }}
                onClick={() => requestLoadToSlot(selectedParentName, 'A', onLoadSlotA)}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(126,184,208,0.15)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
                title="Load into Slot A"
              >A</button>
              <button
                style={{ ...treeStyles.slotBtn, ...treeStyles.slotB }}
                onClick={() => requestLoadToSlot(selectedParentName, 'B', onLoadSlotB)}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(208,168,126,0.15)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
                title="Load into Slot B"
              >B</button>
              <button
                style={treeStyles.saveBtn}
                onClick={() => requestSave(selectedParentName)}
                onMouseEnter={e => { e.currentTarget.style.color = '#8fd18f'; e.currentTarget.style.background = 'rgba(95,143,95,0.1)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = '#5f8f5f'; e.currentTarget.style.background = 'none'; }}
                title={`Save current state as ${selectedParentName}`}
              >
                <svg width="1em" height="1em" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                  <path d="M2.5 2.5h8.25L13.5 5.25v8.25a1 1 0 0 1-1 1h-10a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1Z" />
                  <path d="M5 2.5v4h5.5v-4M4.5 14.5v-4h7v4" />
                </svg>
              </button>
              {PRESET_DELETE_ENABLED && (SHARED_PRESET_TEST_MODE || presets.find(p => p.name === selectedParentName)?.library !== 'stock') && (
                <button
                  style={treeStyles.deleteBtn}
                  onClick={() => requestDelete(selectedParentName)}
                  onMouseEnter={e => { e.currentTarget.style.color = '#ff6666'; e.currentTarget.style.background = 'rgba(143,95,95,0.1)'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#8f5f5f'; e.currentTarget.style.background = 'none'; }}
                  title={`Delete ${selectedParentName}`}
                >✕</button>
              )}
              <PresetRatingStars
                value={localRatings[selectedParentName] ?? presets.find(p => p.name === selectedParentName)?.rating ?? 0}
                onChange={(r) => { void handleRate(selectedParentName, r); }}
                size="0.72rem"
              />
            </div>
            {renderVersionPanel(selectedParentName)}

            {/* Children */}
            <div style={treeStyles.childrenContainer}>
              {children.length === 0 && (
                <span style={treeStyles.emptyText}>No children yet</span>
              )}
              {children.map(child => (
                <React.Fragment key={child.name}>
                <div style={treeStyles.childRow}>
                  <span style={treeStyles.childBranch}>├─</span>
                  <span
                    style={treeStyles.childName}
                    onMouseEnter={e => handleChildMouseEnter(e, child.description || '')}
                    onMouseLeave={handleChildMouseLeave}
                  >
                    {child.variantName !== child.familyName ? child.variantName : child.name}
                    {child.versionCount > 1 && (
                      <span style={{ fontSize: '0.6rem', color: '#666', marginLeft: 3 }}>
                        v{child.currentVersion}
                      </span>
                    )}
                  </span>
                  {child.versionCount > 1 && (
                    <button
                      style={{ ...treeStyles.expandBtn, ...(expandedVersions.has(child.name) ? { color: '#a5c4d4' } : {}) }}
                      onClick={() => toggleVersionExpand(child.name)}
                      title="Show version history"
                    >+</button>
                  )}
                  <button
                    style={{ ...treeStyles.slotBtn, ...treeStyles.slotA }}
                    onClick={() => requestLoadToSlot(child.name, 'A', onLoadSlotA)}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(126,184,208,0.15)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
                    title="Load into Slot A"
                  >A</button>
                  <button
                    style={{ ...treeStyles.slotBtn, ...treeStyles.slotB }}
                    onClick={() => requestLoadToSlot(child.name, 'B', onLoadSlotB)}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(208,168,126,0.15)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
                    title="Load into Slot B"
                  >B</button>
                  {(SHARED_PRESET_TEST_MODE || child.library !== 'stock') && (
                    <>
                      <button
                        style={treeStyles.saveBtn}
                        onClick={() => handleUpdateChild(child.name)}
                        onMouseEnter={e => { e.currentTarget.style.color = '#8fd18f'; e.currentTarget.style.background = 'rgba(95,143,95,0.1)'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = '#5f8f5f'; e.currentTarget.style.background = 'none'; }}
                        title={`Save current state as v${(child.currentVersion || 1) + 1} of ${child.variantName !== child.familyName ? child.variantName : child.name}`}
                      >
                        <svg width="1em" height="1em" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                          <path d="M2.5 2.5h8.25L13.5 5.25v8.25a1 1 0 0 1-1 1h-10a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1Z" />
                          <path d="M5 2.5v4h5.5v-4M4.5 14.5v-4h7v4" />
                        </svg>
                      </button>
                      {PRESET_DELETE_ENABLED && (
                        <button
                          style={treeStyles.deleteBtn}
                          onClick={() => requestDelete(child.name)}
                          onMouseEnter={e => { e.currentTarget.style.color = '#ff6666'; e.currentTarget.style.background = 'rgba(143,95,95,0.1)'; }}
                          onMouseLeave={e => { e.currentTarget.style.color = '#8f5f5f'; e.currentTarget.style.background = 'none'; }}
                          title={`Delete ${child.variantName !== child.familyName ? child.variantName : child.name}`}
                        >✕</button>
                      )}
                    </>
                  )}
                  <PresetRatingStars
                    value={localRatings[child.name] ?? child.rating ?? 0}
                    onChange={(r) => { void handleRate(child.name, r); }}
                    size="0.62rem"
                  />
                </div>
                {renderVersionPanel(child.name)}
                </React.Fragment>
              ))}

              {/* Add child button */}
              {children.length < MAX_CHILDREN && (
                <button
                  style={treeStyles.addChildBtn}
                  onClick={handleOpenChildDialog}
                  onMouseEnter={e => { e.currentTarget.style.color = '#aaa'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#777'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; }}
                >
                  + Add Child
                </button>
              )}
              {children.length >= MAX_CHILDREN && (
                <span style={{ ...treeStyles.emptyText, color: '#886644' }}>
                  Max {MAX_CHILDREN} children reached
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div style={{ ...treeStyles.tooltip, left: tooltip.x, top: tooltip.y }}>
          {tooltip.text}
        </div>
      )}

      {/* Save Dialog (Save / Save As) */}
      {saveDialog && (
        <div style={treeStyles.overlay} onClick={() => setSaveDialog(null)}>
          <div style={treeStyles.dialog} onClick={e => e.stopPropagation()}>
            <div style={treeStyles.dialogTitle}>
              Save Preset
            </div>
            <div style={treeStyles.parentLabel}>
              Current: <strong style={{ color: '#a5c4d4' }}>{saveDialog.originalName}</strong>
            </div>

            {/* Save (overwrite) */}
            <button
              onClick={handleSaveOverwrite}
              disabled={saveBusy}
              style={{
                ...treeStyles.dialogBtn,
                background: 'rgba(184,224,255,0.14)',
                borderColor: 'rgba(184,224,255,0.34)',
                color: '#B8E0FF',
                width: '100%',
                marginBottom: 10,
                padding: '8px 16px',
              }}
            >
              Save "{saveDialog.originalName}"
            </button>

            <div style={{ fontSize: '0.7rem', color: '#888', marginBottom: 4 }}>
              {saveDialog.isChild
                ? `New child name for "${saveDialog.parentName}":`
                : 'New preset name:'}
            </div>
            <input
              type="text"
              value={saveAsName}
              onChange={e => setSaveAsName(e.target.value)}
              placeholder={saveDialog.isChild ? 'New child name' : 'New preset name'}
              style={treeStyles.input}
              maxLength={40}
              onKeyDown={e => {
                if (e.key === 'Enter' && saveAsName.trim()) handleSaveAs();
                if (e.key === 'Escape') setSaveDialog(null);
              }}
            />
            {saveDialog.isChild && saveAsName.trim() && (
              <div style={{ fontSize: '0.65rem', color: '#666', marginBottom: 4 }}>
                Will be used as: <span style={{ color: '#999' }}>{saveDialog.parentName} · {saveAsName.trim()}</span>
              </div>
            )}
            <PresetTagEditor
              value={saveTags}
              onChange={setSaveTags}
              suggestions={tagSuggestions}
              accentColor="#B8E0FF"
            />
            {saveError && (
              <div role="alert" style={{ color: '#e59a9a', fontSize: '0.7rem', marginTop: 6 }}>
                {saveError}
              </div>
            )}
            <div style={treeStyles.dialogBtnRow}>
              <button
                onClick={() => setSaveDialog(null)}
                style={{
                  ...treeStyles.dialogBtn,
                  background: 'rgba(255,255,255,0.05)',
                  borderColor: 'rgba(244,237,228,0.12)',
                  color: 'rgba(244,237,228,0.66)',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleRename}
                disabled={saveBusy || !saveAsName.trim() || (
                  saveDialog.isChild && saveDialog.parentName
                    ? `${saveDialog.parentName} · ${saveAsName.trim()}` === saveDialog.originalName
                    : saveAsName.trim() === saveDialog.originalName
                )}
                style={{
                  ...treeStyles.dialogBtn,
                  background: saveAsName.trim() && (
                    saveDialog.isChild && saveDialog.parentName
                      ? `${saveDialog.parentName} · ${saveAsName.trim()}` !== saveDialog.originalName
                      : saveAsName.trim() !== saveDialog.originalName
                  ) ? 'rgba(214,178,111,0.14)' : 'rgba(255,255,255,0.04)',
                  borderColor: saveAsName.trim() && (
                    saveDialog.isChild && saveDialog.parentName
                      ? `${saveDialog.parentName} · ${saveAsName.trim()}` !== saveDialog.originalName
                      : saveAsName.trim() !== saveDialog.originalName
                  ) ? 'rgba(214,178,111,0.34)' : 'rgba(255,255,255,0.08)',
                  color: saveAsName.trim() && (
                    saveDialog.isChild && saveDialog.parentName
                      ? `${saveDialog.parentName} · ${saveAsName.trim()}` !== saveDialog.originalName
                      : saveAsName.trim() !== saveDialog.originalName
                  ) ? '#d6b26f' : 'rgba(244,237,228,0.32)',
                }}
                title="Rename without changing the preset ID"
              >
                Rename
              </button>
              <button
                onClick={handleSaveAs}
                disabled={!saveAsName.trim() || saveBusy}
                style={{
                  ...treeStyles.dialogBtn,
                  background: saveAsName.trim() ? 'rgba(159,215,170,0.14)' : 'rgba(255,255,255,0.04)',
                  borderColor: saveAsName.trim() ? 'rgba(159,215,170,0.32)' : 'rgba(255,255,255,0.08)',
                  color: saveAsName.trim() ? '#9fd7aa' : 'rgba(244,237,228,0.32)',
                }}
              >
                {saveBusy ? 'Saving…' : 'Save As'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      {confirmAction && (
        <div style={treeStyles.confirmOverlay} onClick={handleConfirmCancel}>
          <div style={treeStyles.confirmBox} onClick={e => e.stopPropagation()}>
            <div style={treeStyles.confirmText}>{confirmAction.message}</div>
            <div style={treeStyles.confirmBtnRow}>
              <button style={treeStyles.confirmBtnCancel} onClick={handleConfirmCancel}>✕</button>
              <button style={treeStyles.confirmBtnOk} onClick={handleConfirmOk}>✓</button>
            </div>
          </div>
        </div>
      )}

      {/* Save Child Dialog */}
      {showChildDialog && (
        <div style={treeStyles.overlay} onClick={() => setShowChildDialog(false)}>
          <div style={treeStyles.dialog} onClick={e => e.stopPropagation()}>
            <div style={treeStyles.dialogTitle}>
              Save Child Preset
            </div>
            <div style={treeStyles.parentLabel}>
              Parent: <strong style={{ color: '#a5c4d4' }}>{selectedParentName}</strong>
            </div>
            <input
              type="text"
              value={childModifier}
              onChange={e => setChildModifier(e.target.value)}
              placeholder="Modifier name (e.g. Drumming)"
              style={treeStyles.input}
              autoFocus
              maxLength={40}
              onKeyDown={e => {
                if (e.key === 'Enter' && childModifier.trim()) handleSaveChild();
                if (e.key === 'Escape') setShowChildDialog(false);
              }}
            />
            <input
              type="text"
              value={childDescription}
              onChange={e => setChildDescription(e.target.value)}
              placeholder="Description (e.g. w/ Drum Machine for Live Performance)"
              style={{ ...treeStyles.input, fontSize: '0.8rem' }}
              maxLength={120}
              onKeyDown={e => {
                if (e.key === 'Enter' && childModifier.trim()) handleSaveChild();
                if (e.key === 'Escape') setShowChildDialog(false);
              }}
            />
            <div style={{ fontSize: '0.7rem', color: '#666', marginBottom: 4 }}>
              Will be saved as: <span style={{ color: '#999' }}>{selectedParentName} · {childModifier.trim() || '...'}</span>
            </div>
            <PresetTagEditor
              value={childTags}
              onChange={setChildTags}
              suggestions={tagSuggestions}
              accentColor="#9fd7aa"
            />
            {saveError && (
              <div role="alert" style={{ color: '#e59a9a', fontSize: '0.7rem', marginTop: 6 }}>
                {saveError}
              </div>
            )}
            <div style={treeStyles.dialogBtnRow}>
              <button
                onClick={() => setShowChildDialog(false)}
                style={{
                  ...treeStyles.dialogBtn,
                  background: 'rgba(255,255,255,0.05)',
                  borderColor: 'rgba(244,237,228,0.12)',
                  color: 'rgba(244,237,228,0.66)',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveChild}
                disabled={!childModifier.trim() || saveBusy}
                style={{
                  ...treeStyles.dialogBtn,
                  background: childModifier.trim() ? 'rgba(159,215,170,0.14)' : 'rgba(255,255,255,0.04)',
                  borderColor: childModifier.trim() ? 'rgba(159,215,170,0.32)' : 'rgba(255,255,255,0.08)',
                  color: childModifier.trim() ? '#9fd7aa' : 'rgba(244,237,228,0.32)',
                }}
              >
                {saveBusy ? 'Saving…' : 'Save Child'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
