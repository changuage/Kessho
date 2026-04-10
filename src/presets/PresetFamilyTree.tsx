// src/presets/PresetFamilyTree.tsx
// Visualizer for a parent preset and its children (max 1 level, max 5 children).
// Children share the parent's familyId but have distinct variantName + description.

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import type { PresetLevel, PresetEntry, PresetSummary, PresetSaveIdentity, PresetVersionMetadata } from './types';
import { usePresets } from './usePresets';
import { getVersionData } from './codec';
import { extractCascade, getCascadeKeys } from './codec';
import { presetValuesEqual } from './presetUtils';
import { DEFAULT_STATE, migratePreset, type SliderState } from '../ui/state';
import type { SliderMode } from '../ui/state';
import { DERIVED_PAD_KEYS } from '../audio/padPresets';

const MAX_CHILDREN = 5;
const FAMILY_TREE_SELECTION_STORAGE_PREFIX = 'preset-family-tree:selected:';

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

export interface PresetFamilyTreeProps {
  level: PresetLevel;
  scope?: string;
  state: SliderState;
  /** Currently loaded preset name */
  currentName?: string;
  /** Load preset into morph Slot A */
  onLoadSlotA: (entry: PresetEntry, data: Record<string, unknown>) => void;
  /** Load preset into morph Slot B */
  onLoadSlotB: (entry: PresetEntry, data: Record<string, unknown>) => void;
  /** Current slider modes (which params are in walk/sampleHold) */
  sliderModes?: Record<string, SliderMode>;
  /** Current dual slider ranges for walk/sampleHold params */
  dualSliderRanges?: Record<string, { min: number; max: number }>;
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
    background: '#1a1a2e',
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
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.85rem',
    background: '#2a5a8a',
    color: 'white',
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
    background: '#1a1a2e',
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
    background: '#1a1a2e',
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
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.8rem',
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
}) => {
  const { presets, families, save, load, remove, refresh } = usePresets(level, scope);
  const selectionStorageKey = useMemo(() => getFamilyTreeSelectionStorageKey(level, scope), [level, scope]);

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
    // A parent preset is any that IS the root of its family
    // (familyName equals its own name, or it's the first variant)
    const parents: PresetSummary[] = [];
    const seenFamilies = new Set<string>();
    for (const p of presets) {
      // A preset is a parent if its variantName equals its familyName (root preset)
      // or if it's the first we see for that family
      if (p.familyName === p.name || p.variantName === p.familyName) {
        if (!seenFamilies.has(p.familyId)) {
          parents.push(p);
          seenFamilies.add(p.familyId);
        }
      }
    }
    // Also add presets that have no family siblings (standalone = parent of empty tree)
    for (const p of presets) {
      if (!seenFamilies.has(p.familyId)) {
        parents.push(p);
        seenFamilies.add(p.familyId);
      }
    }
    return parents;
  }, [presets]);

  // The selected family
  const selectedFamily = useMemo(() => {
    if (!selectedParentName) return null;
    const parent = presets.find(p => p.name === selectedParentName);
    if (!parent) return null;
    return families.find(f => f.familyId === parent.familyId) ?? null;
  }, [selectedParentName, presets, families]);

  // Children of the selected parent (variants that are NOT the parent itself)
  const children = useMemo(() => {
    if (!selectedFamily) return [];
    return selectedFamily.variants.filter(v => v.name !== selectedParentName);
  }, [selectedFamily, selectedParentName]);

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

  // Keys relevant to this preset level+scope (used to filter version diffs)
  const relevantKeys = useMemo(() => {
    const paramLevel = level === 'state' ? 4 : level === 'source' ? 3 : level === 'kit' ? 2 : 1;
    return new Set<string>(getCascadeKeys(paramLevel as 1 | 2 | 3 | 4, scope));
  }, [level, scope]);

  const getCanonicalVersionData = useCallback((entry: PresetEntry, versionNum?: number): Record<string, unknown> => {
    const paramLevel = level === 'state' ? 4 : level === 'source' ? 3 : level === 'kit' ? 2 : 1;
    const rawData = getVersionData(entry, versionNum) || {};
    // Filter reconstituted data to only PARAM_REGISTRY keys BEFORE migration.
    // Delta reconstitution can reintroduce legacy v1 keys (e.g. oceanDurationMin)
    // which migratePreset would then use to overwrite correct values.
    const registryOnly: Record<string, unknown> = {};
    const cascadeKeys = new Set(getCascadeKeys(paramLevel as 1 | 2 | 3 | 4, scope));
    for (const [k, v] of Object.entries(rawData)) {
      if (cascadeKeys.has(k)) registryOnly[k] = v;
    }
    const migrated = migratePreset({
      name: entry.name,
      timestamp: new Date().toISOString(),
      state: registryOnly as unknown as SliderState,
    });
    const canonicalState = {
      ...DEFAULT_STATE,
      ...(migrated.state as Partial<SliderState>),
    } as SliderState;
    return extractCascade(canonicalState, paramLevel as 1 | 2 | 3 | 4, scope);
  }, [level, scope]);

  // Load preset data and call a slot callback (with confirmation)
  const requestLoadToSlot = useCallback((
    name: string,
    slot: 'A' | 'B',
    slotCb: (entry: PresetEntry, data: Record<string, unknown>) => void,
  ) => {
    setConfirmAction({
      message: `Load "${name}" to Slot ${slot}?`,
      onConfirm: async () => {
        const entry = await load(name);
        if (!entry) return;
        const data = getVersionData(entry);
        if (!data) return;
        slotCb(entry, data);
      },
    });
  }, [load]);

  // Save preset — opens save dialog with Save / Save As options
  const requestSave = useCallback((name: string) => {
    // Determine if this preset is a child
    const preset = presets.find(p => p.name === name);
    const isChild = !!(preset && preset.variantName !== preset.familyName);
    const parentName = isChild ? preset?.familyName : undefined;
    setSaveAsName('');
    setSaveDialog({ originalName: name, isChild, parentName });
  }, [presets]);

  // Execute save (overwrite)
  const handleSaveOverwrite = useCallback(async () => {
    if (!saveDialog) return;
    // Pass current dual ranges + slider modes so version diffs compare ranges (not sampled values)
    const meta: PresetVersionMetadata = {};
    if (dualSliderRanges && Object.keys(dualSliderRanges).length > 0) meta.dualRanges = dualSliderRanges;
    if (sliderModes && Object.keys(sliderModes).length > 0) meta.sliderModes = sliderModes;
    const saveMeta = Object.keys(meta).length > 0 ? meta : undefined;
    await save(saveDialog.originalName, state, undefined, undefined, saveMeta, undefined);
    await refresh();
    // Reload version entry so the version panel updates immediately
    const updated = await load(saveDialog.originalName);
    if (updated) setVersionEntries(prev => ({ ...prev, [saveDialog.originalName]: updated }));
    setSaveDialog(null);
  }, [saveDialog, save, state, refresh, load, dualSliderRanges, sliderModes]);

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
  }, [saveDialog, saveAsName, presets]);

  // Actual save-as logic (extracted so confirm can call it too)
  const doSaveAs = useCallback(async (
    dialog: { originalName: string; isChild: boolean; parentName?: string },
    newName: string,
    targetName: string,
  ) => {
    // Pass current dual ranges + slider modes so version diffs compare ranges
    const meta: PresetVersionMetadata = {};
    if (dualSliderRanges && Object.keys(dualSliderRanges).length > 0) meta.dualRanges = dualSliderRanges;
    if (sliderModes && Object.keys(sliderModes).length > 0) meta.sliderModes = sliderModes;
    const saveMeta = Object.keys(meta).length > 0 ? meta : undefined;

    if (dialog.isChild && dialog.parentName) {
      const parentEntry = await load(dialog.parentName);
      if (parentEntry) {
        const parentFamilyId = parentEntry.familyId
          ?? `${level}:${scope ?? 'global'}:${dialog.parentName.toLowerCase().replace(/\s+/g, '-')}`;
        const parentFamilyName = parentEntry.familyName ?? dialog.parentName;
        const identity: PresetSaveIdentity = {
          familyId: parentFamilyId,
          familyName: parentFamilyName,
          variantName: newName,
        };
        await save(targetName, state, undefined, undefined, saveMeta, identity);
      }
    } else {
      await save(targetName, state, undefined, undefined, saveMeta, undefined);
    }
    await refresh();
    // Reload version entry so the version panel updates immediately
    const updated = await load(targetName);
    if (updated) setVersionEntries(prev => ({ ...prev, [targetName]: updated }));
    setSaveDialog(null);

    // Auto-select the new preset in the dropdown
    setSelectedParentName(dialog.isChild && dialog.parentName ? dialog.parentName : targetName);
  }, [save, load, state, refresh, level, scope, dualSliderRanges, sliderModes]);

  // Delete preset (with confirmation)
  const requestDelete = useCallback((name: string) => {
    setConfirmAction({
      message: `Delete "${name}"?`,
      onConfirm: async () => {
        await remove(name);
        if (selectedParentName === name) setSelectedParentName('');
        await refresh();
      },
    });
  }, [remove, selectedParentName, refresh]);

  // Select parent from dropdown (no auto-load — just show tree)
  const handleSelectParent = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedParentName(e.target.value);
  }, []);

  // Open save-child dialog
  const handleOpenChildDialog = useCallback(() => {
    setChildModifier('');
    setChildDescription('');
    setShowChildDialog(true);
  }, []);

  // Save child
  const handleSaveChild = useCallback(async () => {
    if (!childModifier.trim() || !selectedParentName) return;

    const parentEntry = await load(selectedParentName);
    if (!parentEntry) return;

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

    const meta: PresetVersionMetadata = {};
    if (dualSliderRanges && Object.keys(dualSliderRanges).length > 0) meta.dualRanges = dualSliderRanges;
    if (sliderModes && Object.keys(sliderModes).length > 0) meta.sliderModes = sliderModes;
    const saveMeta = Object.keys(meta).length > 0 ? meta : undefined;

    await save(childName, state, undefined, undefined, saveMeta, identity);
    await refresh();
    // Reload version entry so the version panel updates immediately
    const updated = await load(childName);
    if (updated) setVersionEntries(prev => ({ ...prev, [childName]: updated }));
    setShowChildDialog(false);
  }, [childModifier, childDescription, selectedParentName, load, save, state, refresh, level, scope, dualSliderRanges, sliderModes]);

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
    slotCb: (entry: PresetEntry, data: Record<string, unknown>) => void,
  ) => {
    setConfirmAction({
      message: `Load "${name}" v${versionNum} to Slot ${slot}?`,
      onConfirm: async () => {
        const entry = versionEntries[name] || await load(name);
        if (!entry) return;
        const data = getVersionData(entry, versionNum);
        if (!data) return;
        slotCb({ ...entry, currentVersion: versionNum }, data);
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
        const data = getVersionData(entry, versionNum);
        if (!data) return;
        // Save the old version's data as though it's the current state
        await save(name, data as unknown as SliderState, undefined, undefined, undefined, undefined);
        await refresh();
        // Reload the entry for version panel
        const updated = await load(name);
        if (updated) setVersionEntries(prev => ({ ...prev, [name]: updated }));
      },
    });
  }, [load, save, refresh, versionEntries]);

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
    const target = sorted[targetIdx];
    const prev = targetIdx > 0 ? sorted[targetIdx - 1] : null;

    // Get full data for each
    const v1Data = v1 ? getCanonicalVersionData(entry, v1.v) : {};
    const targetData = getCanonicalVersionData(entry, versionNum);
    const prevData = prev ? getCanonicalVersionData(entry, prev.v) : null;

    // Saved dual ranges per version (used for S&H/dual-mode params)
    const v1Ranges = v1?.dualRanges || {};
    const targetRanges = target?.dualRanges || {};
    const prevRanges = prev?.dualRanges || {};

    // Compare two versions, considering dual-range metadata.
    // For params in dual mode: compare min/max ranges (not instantaneous sampled value).
    // For single-mode params: compare snapshot values directly.
    const diffKeys = (
      aData: Record<string, unknown>,
      bData: Record<string, unknown>,
      aRanges: Record<string, { min: number; max: number }>,
      bRanges: Record<string, { min: number; max: number }>,
    ): string[] => {
      const result: string[] = [];
      for (const key of new Set([...Object.keys(aData), ...Object.keys(bData)])) {
        if (key === '_isDelta') continue;
        if (!relevantKeys.has(key)) continue;
        if (DERIVED_PAD_KEYS.has(key)) continue;

        const aRange = aRanges[key];
        const bRange = bRanges[key];
        // If either version has a dual range for this key, compare ranges
        if (aRange || bRange) {
          const aMin = aRange?.min ?? 0;
          const aMax = aRange?.max ?? 0;
          const bMin = bRange?.min ?? 0;
          const bMax = bRange?.max ?? 0;
          if (aMin !== bMin || aMax !== bMax) {
            result.push(humanize(key));
          }
          continue;
        }
        // Single mode: compare snapshot values
        if (!presetValuesEqual(aData[key], bData[key])) {
          result.push(humanize(key));
        }
      }
      return result;
    };

    const fromV1 = diffKeys(v1Data, targetData, v1Ranges, targetRanges);
    const fromPrev = prevData
      ? diffKeys(prevData, targetData, prevRanges, targetRanges)
      : [];

    return { fromV1, fromPrev };
  }, [humanize, relevantKeys, getCanonicalVersionData]);

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

    // Get saved dual ranges from the latest version.
    // Use canonicalized saved data here so old presets that predate newer params
    // do not show phantom diffs simply because migration/default fill-ins happen on load.
    const latestVer = sorted[sorted.length - 1];
    const latestSaved = latestVer ? getCanonicalVersionData(entry, latestVer.v) : {};
    const savedDualRanges = latestVer?.dualRanges || {};

    const currentDiffKeys: string[] = [];
    for (const key of new Set([...Object.keys(currentData), ...Object.keys(latestSaved)])) {
      if (key === '_isDelta') continue;
      // Only compare params at this preset's own level+scope
      if (!relevantKeys.has(key)) continue;
      // Skip pad-morph-derived params — recomputed on load, causes phantom diffs
      if (DERIVED_PAD_KEYS.has(key)) continue;

      // If this param is in dual mode, compare its range instead of instantaneous value
      const mode = sliderModes?.[key];
      if (mode && mode !== 'single') {
        const curRange = dualSliderRanges?.[key];
        const savRange = savedDualRanges[key];
        const curMin = curRange?.min ?? 0;
        const curMax = curRange?.max ?? 0;
        const savMin = savRange?.min ?? 0;
        const savMax = savRange?.max ?? 0;
        if (curMin !== savMin || curMax !== savMax) {
          currentDiffKeys.push(humanize(key));
        }
        continue;
      }

      if (!presetValuesEqual(currentData[key], latestSaved[key])) currentDiffKeys.push(humanize(key));
    }

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
  }, [versionEntries, expandedVersions, getVersionDiffs, requestLoadVersion, requestPromoteVersion, onLoadSlotA, onLoadSlotB, state, level, scope, humanize, sliderModes, dualSliderRanges, relevantKeys, getCanonicalVersionData]);

  // Tooltip handlers
  const handleChildMouseEnter = useCallback((e: React.MouseEvent, description: string) => {
    if (!description) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({ text: description, x: rect.left, y: rect.bottom + 4 });
  }, []);
  const handleChildMouseLeave = useCallback(() => setTooltip(null), []);

  // Auto-select parent if currentName matches
  useEffect(() => {
    if (!currentName || selectedParentName) return;
    // Check if currentName is a parent
    const isParent = parentPresets.some(p => p.name === currentName);
    if (isParent) {
      setSelectedParentName(currentName);
      return;
    }
    // Check if currentName is a child — find its parent
    const preset = presets.find(p => p.name === currentName);
    if (preset) {
      const family = families.find(f => f.familyId === preset.familyId);
      if (family) {
        const parent = family.variants.find(v => v.name === v.familyName || v.variantName === v.familyName);
        if (parent) {
          setSelectedParentName(parent.name);
          return;
        }
        // fallback: first variant is parent
        const first = family.variants[0];
        if (first) {
          setSelectedParentName(first.name);
        }
      }
    }
  }, [currentName, parentPresets, presets, families, selectedParentName]);

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
              >💾</button>
              {presets.find(p => p.name === selectedParentName)?.library !== 'stock' && (
                <button
                  style={treeStyles.deleteBtn}
                  onClick={() => requestDelete(selectedParentName)}
                  onMouseEnter={e => { e.currentTarget.style.color = '#ff6666'; e.currentTarget.style.background = 'rgba(143,95,95,0.1)'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#8f5f5f'; e.currentTarget.style.background = 'none'; }}
                  title={`Delete ${selectedParentName}`}
                >✕</button>
              )}
              <button
                style={{ ...treeStyles.expandBtn, ...(expandedVersions.has(selectedParentName) ? { color: '#a5c4d4' } : {}) }}
                onClick={() => toggleVersionExpand(selectedParentName)}
                title="Show version history"
              >+</button>
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
                  {child.library !== 'stock' && (
                    <>
                      <button
                        style={treeStyles.saveBtn}
                        onClick={() => handleUpdateChild(child.name)}
                        onMouseEnter={e => { e.currentTarget.style.color = '#8fd18f'; e.currentTarget.style.background = 'rgba(95,143,95,0.1)'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = '#5f8f5f'; e.currentTarget.style.background = 'none'; }}
                        title={`Save current state as v${(child.currentVersion || 1) + 1} of ${child.variantName !== child.familyName ? child.variantName : child.name}`}
                      >💾</button>
                      <button
                        style={treeStyles.deleteBtn}
                        onClick={() => requestDelete(child.name)}
                        onMouseEnter={e => { e.currentTarget.style.color = '#ff6666'; e.currentTarget.style.background = 'rgba(143,95,95,0.1)'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = '#8f5f5f'; e.currentTarget.style.background = 'none'; }}
                        title={`Delete ${child.variantName !== child.familyName ? child.variantName : child.name}`}
                      >✕</button>
                    </>
                  )}
                  {child.versionCount > 1 && (
                    <button
                      style={{ ...treeStyles.expandBtn, ...(expandedVersions.has(child.name) ? { color: '#a5c4d4' } : {}) }}
                      onClick={() => toggleVersionExpand(child.name)}
                      title="Show version history"
                    >+</button>
                  )}
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
              style={{
                ...treeStyles.dialogBtn,
                background: '#2a5a8a',
                color: 'white',
                width: '100%',
                marginBottom: 10,
                padding: '8px 16px',
              }}
            >
              Save "{saveDialog.originalName}"
            </button>

            {/* Save As */}
            <div style={{ fontSize: '0.7rem', color: '#888', marginBottom: 4 }}>
              {saveDialog.isChild
                ? `Save as new child of "${saveDialog.parentName}":`
                : 'Save as new preset:'}
            </div>
            <input
              type="text"
              value={saveAsName}
              onChange={e => setSaveAsName(e.target.value)}
              placeholder={saveDialog.isChild ? 'New modifier name' : 'New preset name'}
              style={treeStyles.input}
              maxLength={40}
              onKeyDown={e => {
                if (e.key === 'Enter' && saveAsName.trim()) handleSaveAs();
                if (e.key === 'Escape') setSaveDialog(null);
              }}
            />
            {saveDialog.isChild && saveAsName.trim() && (
              <div style={{ fontSize: '0.65rem', color: '#666', marginBottom: 4 }}>
                Will be saved as: <span style={{ color: '#999' }}>{saveDialog.parentName} · {saveAsName.trim()}</span>
              </div>
            )}
            <div style={treeStyles.dialogBtnRow}>
              <button
                onClick={() => setSaveDialog(null)}
                style={{ ...treeStyles.dialogBtn, background: 'rgba(255,255,255,0.08)', color: '#999' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveAs}
                disabled={!saveAsName.trim()}
                style={{
                  ...treeStyles.dialogBtn,
                  background: saveAsName.trim() ? '#2a6a4a' : '#333',
                  color: saveAsName.trim() ? 'white' : '#666',
                }}
              >
                Save As
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
            <div style={treeStyles.dialogBtnRow}>
              <button
                onClick={() => setShowChildDialog(false)}
                style={{ ...treeStyles.dialogBtn, background: 'rgba(255,255,255,0.08)', color: '#999' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveChild}
                disabled={!childModifier.trim()}
                style={{
                  ...treeStyles.dialogBtn,
                  background: childModifier.trim() ? '#2a5a8a' : '#333',
                  color: childModifier.trim() ? 'white' : '#666',
                }}
              >
                Save Child
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
