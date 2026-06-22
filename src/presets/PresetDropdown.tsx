// src/presets/PresetDropdown.tsx
// Phase 3 + 8 + 9 — Reusable preset dropdown with save/export/import/versioning/dirty flag.
// Matches existing app styling (native <select>, dark theme, CSS custom properties).

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { PresetLevel, PresetEntry, PresetRecoveryWarning, PresetSummary } from './types';
import { usePresets } from './usePresets';
import { exportPresetToFile, importPresetFromFile } from './fileIO';
import { getPresetStore } from './PresetStore';
import { extractPresetVersionMetadata, isPresetCompatibleWithSlot, presetValuesEqual } from './presetUtils';
import { getPresetDisplayLabel } from './catalog';
import { getVersionData } from './codec';
import { PRESET_DELETE_ENABLED, SHARED_PRESET_TEST_MODE } from './sharedMode';
import { PresetRatingStars } from './PresetRatingStars';
import { PresetPoolPopup } from './PresetPoolPopup';
import { PresetTagEditor } from './PresetTagEditor';
import { usePresetPoolCandidates } from './PresetPoolContext';
import { PRESET_POOL_ICON, getPresetPoolLabel, type PresetPoolCandidate } from './presetPool';
import { DEFAULT_STATE, type SliderMode, type SliderState } from '../ui/state';
import type { UsePresetsOptions } from './usePresets';
import { blurSelectAfterChange } from '../ui/shared/selectFocus';

type PresetLoadResult = boolean | void | Promise<boolean | void>;

export interface PresetDropdownProps {
  /** Preset level */
  level: PresetLevel;
  /** Scope — engine name for L1 (e.g. 'pad1', 'drumKick'), source for L2/L3 */
  scope?: string;
  /** Current slider state (used to extract params for saving) */
  state: SliderState;
  /** Currently loaded preset name (for display) */
  currentName?: string;
  /** Called when a preset is loaded */
  onLoad: (entry: PresetEntry, data: Record<string, unknown>) => PresetLoadResult;
  /** Optional non-destructive audio preview for preset-pool audition buttons */
  onAudition?: (entry: PresetEntry, data: Record<string, unknown>) => void | Promise<void>;
  /** Called when state is updated after applying preset */
  onStateChange?: React.Dispatch<React.SetStateAction<SliderState>>;
  /** Optional: accent color for focus ring */
  accentColor?: string;
  /** Optional: additional CSS class */
  className?: string;
  /** Whether to show export/import buttons. Default: true */
  showFileButtons?: boolean;
  /** Whether to show the save button. Default: true */
  showSaveButton?: boolean;
  /** Optional visible label for the save button. Defaults to a compact icon. */
  saveButtonLabel?: string;
  /** Optional title shown at the top of the save dialog. */
  saveDialogTitle?: string;
  /** Optional fallback name when saving without a selected preset. */
  defaultSaveName?: string;
  /** Options passed to usePresets (e.g. customExtract for composite presets) */
  presetOptions?: UsePresetsOptions;
  /** Compact mode — smaller font, less padding */
  compact?: boolean;
  /** Current non-single slider modes for this page, used when saving/restoring dual sliders */
  sliderModes?: Record<string, SliderMode>;
  /** Current dual slider ranges for this page, used when saving/restoring dual sliders */
  dualSliderRanges?: Record<string, { min: number; max: number }>;
  /** Apply loaded dual slider metadata back into page state */
  onDualStateChange?: (
    relevantKeys: string[],
    dualRanges?: Record<string, { min: number; max: number }>,
    sliderModes?: Record<string, SliderMode>,
  ) => void;
}

const dropdownStyles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    minWidth: 0,
    width: '100%',
  },
  select: {
    flex: '1 1 13rem',
    minWidth: 0,
    fontSize: '0.75rem',
    background: 'rgba(0, 0, 0, 0.3)',
    color: '#ccc',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: '4px',
    padding: '3px 6px',
    cursor: 'pointer',
    colorScheme: 'dark' as const,
  },
  iconBtn: {
    background: 'none',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    borderRadius: '4px',
    color: '#999',
    cursor: 'pointer',
    padding: '2px 5px',
    fontSize: '0.7rem',
    lineHeight: 1,
    transition: 'color 0.15s, border-color 0.15s',
    flexShrink: 0,
  },
  saveDialog: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    padding: '12px',
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  savePanel: {
    background: '#171615',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '8px',
    padding: '16px',
    width: 'min(400px, calc(100vw - 24px))',
    minWidth: 'min(280px, calc(100vw - 24px))',
    maxWidth: 'calc(100vw - 24px)',
    maxHeight: 'min(80dvh, 560px)',
    overflowY: 'auto' as const,
    boxSizing: 'border-box' as const,
  },
  input: {
    width: '100%',
    padding: '8px',
    borderRadius: '4px',
    border: '1px solid rgba(255,255,255,0.2)',
    background: 'rgba(0,0,0,0.3)',
    color: 'white',
    fontSize: '0.85rem',
    marginBottom: '8px',
    boxSizing: 'border-box' as const,
  },
  dialogBtn: {
    padding: '6px 16px',
    borderRadius: '4px',
    border: '1px solid rgba(244,237,228,0.12)',
    cursor: 'pointer',
    fontSize: '0.8rem',
    fontWeight: 700,
    marginRight: '8px',
  },
};

function normalizePresetName(name: string): string {
  return name.trim().toLowerCase();
}

function dedupePresetSummaries(presets: PresetSummary[]): PresetSummary[] {
  const byKey = new Map<string, PresetSummary>();
  for (const preset of presets) {
    const key = normalizePresetName(preset.name);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, preset);
      continue;
    }
    const existingRank = existing.library === 'cloud' ? 3 : existing.library === 'user' ? 2 : 1;
    const presetRank = preset.library === 'cloud' ? 3 : preset.library === 'user' ? 2 : 1;
    if (presetRank > existingRank || (presetRank === existingRank && (preset.updatedAt ?? 0) > (existing.updatedAt ?? 0))) {
      byKey.set(key, preset);
    }
  }
  return Array.from(byKey.values());
}

function formatRecoveryWarning(warnings: PresetRecoveryWarning[]): string {
  if (warnings.length === 0) return '';
  const slots = [...new Set(warnings.map(warning => warning.slot).filter(Boolean))].slice(0, 4);
  const slotText = slots.length > 0 ? ` (${slots.join(', ')}${warnings.length > slots.length ? ', ...' : ''})` : '';
  return `This preset was partially recovered${slotText}. Missing parts loaded OFF or bypassed; save a new version to repair it.`;
}

export const PresetDropdown: React.FC<PresetDropdownProps> = ({
  level,
  scope,
  state,
  currentName,
  onLoad,
  onAudition,
  onStateChange,
  accentColor,
  className,
  showFileButtons = true,
  showSaveButton = true,
  saveButtonLabel,
  saveDialogTitle,
  defaultSaveName,
  presetOptions,
  compact = false,
  sliderModes,
  dualSliderRanges,
  onDualStateChange,
}) => {
  const { presets, save, load, loadById, remove, rename, refresh, extract, apply, updateMetadata } = usePresets(level, scope, presetOptions);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showPoolPopup, setShowPoolPopup] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveNote, setSaveNote] = useState('');
  const [saveTags, setSaveTags] = useState<string[]>([]);
  const [savePublic, setSavePublic] = useState(SHARED_PRESET_TEST_MODE);
  const [selectedName, setSelectedName] = useState(currentName || '');
  const [loadedEntry, setLoadedEntry] = useState<PresetEntry | null>(null);
  const [loadedData, setLoadedData] = useState<Record<string, unknown> | null>(null);
  const [localRatings, setLocalRatings] = useState<Record<string, number>>({});
  const loadRequestIdRef = useRef(0);
  const dedupedPresets = useMemo(() => dedupePresetSummaries(presets), [presets]);
  const sortedPresets = useMemo(
    () => [...dedupedPresets].sort((left, right) => left.name.localeCompare(right.name)),
    [dedupedPresets],
  );
  const poolCandidates = useMemo<PresetPoolCandidate[]>(() => sortedPresets.map(preset => ({
    id: preset.id ?? preset.remoteId ?? preset.name,
    name: preset.name,
    library: preset.library,
    tags: preset.tags,
    aliases: [preset.remoteId, preset.name].filter((value): value is string => Boolean(value)),
    subtitle: preset.creator,
    updatedAt: preset.updatedAt,
    rating: localRatings[preset.name] ?? preset.rating,
  })), [localRatings, sortedPresets]);
  const selectedPresetSummary = useMemo<PresetSummary | null>(() => {
    if (!selectedName) return null;
    return sortedPresets.find(p => p.name === selectedName) ?? null;
  }, [sortedPresets, selectedName]);
  const selectedPoolKeepIds = useMemo(() => {
    if (selectedPresetSummary) {
      return [selectedPresetSummary.id, selectedPresetSummary.remoteId, selectedPresetSummary.name]
        .filter((value): value is string => Boolean(value));
    }
    return selectedName ? [selectedName] : [];
  }, [selectedName, selectedPresetSummary]);
  const {
    poolKey,
    poolIds,
    filteredCandidates: filteredPoolCandidates,
    setPoolIds,
    resetPoolIds,
  } = usePresetPoolCandidates(level, scope, poolCandidates, selectedPoolKeepIds);
  const visiblePresets = useMemo(() => {
    if (!poolKey) return sortedPresets;
    const visibleNames = new Set(filteredPoolCandidates.map(candidate => candidate.name));
    return sortedPresets.filter(preset => visibleNames.has(preset.name));
  }, [filteredPoolCandidates, poolKey, sortedPresets]);
  const tagSuggestions = useMemo(() => {
    const tags = new Set<string>();
    for (const preset of sortedPresets) {
      for (const tag of preset.tags ?? []) tags.add(tag);
    }
    return [...tags].sort((left, right) => left.localeCompare(right));
  }, [sortedPresets]);
  const recoveryMessage = useMemo(
    () => formatRecoveryWarning(loadedEntry?.recoveryWarnings ?? []),
    [loadedEntry],
  );
  const canChangeVisibility = !SHARED_PRESET_TEST_MODE && selectedPresetSummary?.library !== 'stock';
  const isSelectedPresetPublic = selectedPresetSummary?.visibility === 'public';
  const canRenameSelectedPreset = Boolean(
    selectedName
    && selectedPresetSummary
    && (SHARED_PRESET_TEST_MODE || selectedPresetSummary.library !== 'stock'),
  );

  const canonicalizeLoadedData = useCallback((data: Record<string, unknown>) => {
    const canonicalState = apply(DEFAULT_STATE, data);
    return extract(canonicalState);
  }, [apply, extract]);

  const applyLoadedData = useCallback((data: Record<string, unknown>) => {
    onStateChange?.((currentState) => apply(currentState, data));
  }, [apply, onStateChange]);

  // Dirty detection: compare current state params against last loaded version
  const isDirty = useMemo(() => {
    if (!loadedEntry || !loadedData) return false;
    const currentParams = extract(state);
    const keys = new Set([...Object.keys(loadedData), ...Object.keys(currentParams)]);
    for (const key of keys) {
      if (!presetValuesEqual(loadedData[key], currentParams[key])) {
        return true;
      }
    }
    return false;
  }, [loadedEntry, loadedData, state, extract]);

  useEffect(() => {
    setSelectedName(currentName || '');
  }, [currentName]);

  const getSelectedVersion = useCallback((entry: PresetEntry, version?: number) => (
    entry.versions.find(v => v.v === (version ?? entry.currentVersion))
    ?? entry.versions[entry.versions.length - 1]
    ?? null
  ), []);

  const extractCurrentDualMetadata = useCallback((data: Record<string, unknown>) => {
    const relevantKeys = new Set(Object.keys(data));
    const nextDualRanges: Record<string, { min: number; max: number }> = {};
    const nextSliderModes: Record<string, SliderMode> = {};

    if (dualSliderRanges) {
      for (const [key, range] of Object.entries(dualSliderRanges)) {
        if (relevantKeys.has(key)) {
          nextDualRanges[key] = { min: range.min, max: range.max };
        }
      }
    }

    if (sliderModes) {
      for (const [key, mode] of Object.entries(sliderModes)) {
        if (mode !== 'single' && relevantKeys.has(key)) {
          nextSliderModes[key] = mode;
        }
      }
    }

    return {
      dualRanges: Object.keys(nextDualRanges).length > 0 ? nextDualRanges : undefined,
      sliderModes: Object.keys(nextSliderModes).length > 0 ? nextSliderModes : undefined,
    };
  }, [dualSliderRanges, sliderModes]);

  const applyPresetEntry = useCallback(async (
    entry: PresetEntry,
    requestId: number,
    commitSelection: boolean,
  ): Promise<boolean> => {
    const version = getSelectedVersion(entry);
    if (!version) return false;

    const versionData = getVersionData(entry);
    if (requestId !== loadRequestIdRef.current) return false;
    if (!versionData) return false;

    const didLoad = await onLoad(entry, versionData);
    if (requestId !== loadRequestIdRef.current) return false;
    if (didLoad === false) {
      if (commitSelection) setSelectedName(currentName ?? '');
      return false;
    }

    if (commitSelection) {
      setSelectedName(entry.name);
      setLoadedEntry(entry);
      setLoadedData(canonicalizeLoadedData(versionData));
    }
    applyLoadedData(versionData);
    onDualStateChange?.(
      Object.keys(versionData),
      version.dualRanges,
      version.sliderModes as Record<string, SliderMode> | undefined,
    );
    return true;
  }, [applyLoadedData, canonicalizeLoadedData, currentName, getSelectedVersion, onDualStateChange, onLoad]);

  const resolvePresetCandidateEntry = useCallback(async (candidate: PresetPoolCandidate): Promise<PresetEntry | null> => {
    const byId = await loadById(candidate.id);
    if (byId && isPresetCompatibleWithSlot(byId, level, scope)) return byId;
    return load(candidate.name);
  }, [level, load, loadById, scope]);

  // Handle preset selection from dropdown
  const handleSelect = useCallback(async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const select = e.currentTarget;
    const name = select.value;
    blurSelectAfterChange(select);
    if (!name) return;
    const requestId = ++loadRequestIdRef.current;
    setSelectedName(name);
    const entry = await load(name);
    if (requestId !== loadRequestIdRef.current) return;
    if (!entry) return;
    await applyPresetEntry(entry, requestId, true);
  }, [load, applyPresetEntry]);

  const handlePoolAudition = useCallback(async (candidate: PresetPoolCandidate) => {
    if (!onAudition) return;
    const requestId = ++loadRequestIdRef.current;
    const entry = await resolvePresetCandidateEntry(candidate);
    if (requestId !== loadRequestIdRef.current || !entry) return;
    const versionData = getVersionData(entry);
    if (!versionData) return;
    await onAudition(entry, versionData);
  }, [onAudition, resolvePresetCandidateEntry]);

  const handlePoolLoad = useCallback(async (candidate: PresetPoolCandidate) => {
    const requestId = ++loadRequestIdRef.current;
    const entry = await resolvePresetCandidateEntry(candidate);
    if (requestId !== loadRequestIdRef.current || !entry) return;
    const loaded = await applyPresetEntry(entry, requestId, true);
    if (loaded) setShowPoolPopup(false);
  }, [applyPresetEntry, resolvePresetCandidateEntry]);

  const handlePoolDelete = useCallback(async (candidate: PresetPoolCandidate): Promise<boolean> => {
    const entry = await resolvePresetCandidateEntry(candidate);
    if (!entry) return false;
    const removed = await remove(entry.name);
    if (!removed) return false;
    if (selectedName === entry.name) {
      setSelectedName('');
      setLoadedEntry(null);
      setLoadedData(null);
    }
    return true;
  }, [remove, resolvePresetCandidateEntry, selectedName]);

  const handlePoolRate = useCallback(async (candidate: PresetPoolCandidate, rating: number) => {
    const entry = await resolvePresetCandidateEntry(candidate);
    if (!entry) return;
    setLocalRatings(prev => ({ ...prev, [entry.name]: rating }));
    try {
      await updateMetadata(entry.name, { rating });
    } catch (ratingError) {
      console.warn('Failed to update preset rating:', ratingError);
    }
  }, [resolvePresetCandidateEntry, updateMetadata]);

  // Open save dialog
  const handleSaveClick = useCallback(() => {
    setSaveName(selectedName || defaultSaveName || `My ${scope || level} Preset`);
    setSaveNote('');
    setSaveTags(selectedPresetSummary?.tags ?? loadedEntry?.tags ?? []);
    setSavePublic(SHARED_PRESET_TEST_MODE || selectedPresetSummary?.visibility === 'public');
    setShowSaveDialog(true);
  }, [defaultSaveName, selectedName, scope, level, selectedPresetSummary, loadedEntry]);

  // Confirm save
  const handleSaveConfirm = useCallback(async () => {
    if (!saveName.trim()) return;
    const version = loadedEntry ? getSelectedVersion(loadedEntry) : null;
    const trimmedName = saveName.trim();
    const currentDualMetadata = extractCurrentDualMetadata(extract(state));
    const preservedMetadata = extractPresetVersionMetadata(version);
    const mergedMetadata = {
      ...(preservedMetadata || {}),
      ...(currentDualMetadata.dualRanges ? { dualRanges: currentDualMetadata.dualRanges } : {}),
      ...(currentDualMetadata.sliderModes ? { sliderModes: currentDualMetadata.sliderModes } : {}),
    };
    if (!currentDualMetadata.dualRanges) {
      delete mergedMetadata.dualRanges;
    }
    if (!currentDualMetadata.sliderModes) {
      delete mergedMetadata.sliderModes;
    }
    const visibility = SHARED_PRESET_TEST_MODE || savePublic ? 'public' : 'private';
    await save(
      trimmedName,
      state,
      saveNote.trim() || undefined,
      saveTags,
      Object.keys(mergedMetadata).length > 0 ? mergedMetadata : undefined,
      { visibility },
    );
    await refresh();
    const savedEntry = await load(trimmedName);
    setLoadedEntry(savedEntry ?? null);
    // Update loadedData so dirty flag resets
    if (savedEntry) {
      const verData = getVersionData(savedEntry);
      setLoadedData(verData ? canonicalizeLoadedData(verData) : null);
    } else {
      setLoadedData(null);
    }
    setSelectedName(savedEntry?.name ?? trimmedName);
    setShowSaveDialog(false);
  }, [saveName, saveNote, saveTags, savePublic, state, save, loadedEntry, refresh, load, getSelectedVersion, extractCurrentDualMetadata, extract, canonicalizeLoadedData]);

  const handleRenameConfirm = useCallback(async () => {
    if (!canRenameSelectedPreset || !selectedName) return;
    const trimmedName = saveName.trim();
    if (!trimmedName || trimmedName === selectedName) return;

    const renamedEntry = await rename(selectedName, trimmedName, { tags: saveTags });
    if (!renamedEntry) return;

    const savedEntry = await load(renamedEntry.name);
    setLoadedEntry(savedEntry ?? renamedEntry);
    const verData = getVersionData(savedEntry ?? renamedEntry);
    setLoadedData(verData ? canonicalizeLoadedData(verData) : null);
    setSelectedName(renamedEntry.name);
    setSaveName(renamedEntry.name);
    setShowSaveDialog(false);
  }, [canRenameSelectedPreset, selectedName, saveName, saveTags, rename, load, canonicalizeLoadedData]);

  // Export current preset
  const handleExport = useCallback(async () => {
    if (!selectedName) return;
    const entry = await load(selectedName);
    if (entry) {
      await exportPresetToFile(entry);
    }
  }, [selectedName, load]);

  // Import preset from file
  const handleImport = useCallback(async () => {
    const requestId = ++loadRequestIdRef.current;
    const entry = await importPresetFromFile();
    if (!entry) return;

    if (!isPresetCompatibleWithSlot(entry, level, scope)) {
      const message = `Imported preset "${entry.name}" is not compatible with this ${level} slot${scope ? ` (${scope})` : ''}.`;
      if (typeof window !== 'undefined' && typeof window.alert === 'function') {
        window.alert(message);
      } else {
        console.warn(message);
      }
      return;
    }

    // Save to store
    const store = getPresetStore();
    await store.save(entry);
    await refresh();

    // Load it
    const savedEntry = await load(entry.name);
    if (requestId !== loadRequestIdRef.current) return;
    const selectedEntry = savedEntry ?? entry;
    const selectedVersion = getSelectedVersion(selectedEntry);
    if (!selectedVersion) return;
    const versionData = getVersionData(selectedEntry);
    if (requestId !== loadRequestIdRef.current) return;
    if (!versionData) return;
    const didLoad = await onLoad(selectedEntry, versionData);
    if (requestId !== loadRequestIdRef.current) return;
    if (didLoad === false) {
      setSelectedName(currentName ?? '');
      return;
    }

    setSelectedName(entry.name);
    setLoadedEntry(selectedEntry);
    setLoadedData(canonicalizeLoadedData(versionData));
    applyLoadedData(versionData);
    onDualStateChange?.(
      Object.keys(versionData),
      selectedVersion.dualRanges,
      selectedVersion.sliderModes as Record<string, SliderMode> | undefined,
    );
  }, [refresh, load, getSelectedVersion, onLoad, onDualStateChange, canonicalizeLoadedData, applyLoadedData, currentName]);

  // Delete selected preset
  const handleDelete = useCallback(async () => {
    if (!PRESET_DELETE_ENABLED) return;
    if (!selectedName) return;
    const entry = await load(selectedName);
    if (!entry) return;
    if (!SHARED_PRESET_TEST_MODE && (entry.library === 'stock' || entry.author === 'factory')) return;
    if (!confirm(`Delete preset "${selectedName}"?`)) return;
    const removed = await remove(selectedName);
    if (!removed) return;
    setSelectedName('');
    setLoadedEntry(null);
    setLoadedData(null);
  }, [selectedName, load, remove]);

  const handleToggleVisibility = useCallback(async () => {
    if (SHARED_PRESET_TEST_MODE) return;
    if (!selectedName) return;
    const entry = await load(selectedName);
    if (!entry) return;

    entry.visibility = entry.visibility === 'public' ? 'private' : 'public';
    await getPresetStore().save(entry);
    await refresh();
    setLoadedEntry(entry);
  }, [selectedName, load, refresh]);

  const handleRate = useCallback(async (name: string, rating: number) => {
    setLocalRatings(prev => ({ ...prev, [name]: rating }));
    try {
      await updateMetadata(name, { rating });
    } catch (ratingError) {
      console.warn('Failed to update preset rating:', ratingError);
    }
  }, [updateMetadata]);

  const selectBorderColor = isDirty
    ? '#c9913666'
    : accentColor
      ? `${accentColor}33`
      : 'rgba(255, 255, 255, 0.15)';

  const selectStyle: React.CSSProperties = {
    ...dropdownStyles.select,
    ...(compact ? { flexBasis: '10rem', fontSize: '0.7rem', padding: '2px 4px' } : {}),
    border: `1px solid ${selectBorderColor}`,
  };

  return (
    <>
      <div className={className} style={dropdownStyles.container}>
        {isDirty && (
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#c99136',
              flexShrink: 0,
            }}
            title="Modified — params differ from loaded preset"
          />
        )}
        {recoveryMessage && (
          <span
            style={{
              color: '#d5a642',
              fontSize: compact ? '0.64rem' : '0.68rem',
              fontWeight: 700,
              lineHeight: 1,
              flexShrink: 0,
            }}
            title={recoveryMessage}
            aria-label={recoveryMessage}
          >
            Recovered
          </span>
        )}
        <select
          value={selectedName}
          onChange={handleSelect}
          style={selectStyle}
          title={`${level} preset`}
        >
          <option value="">— Select —</option>
          {visiblePresets.map(p => (
            <option key={`${p.library}:${p.name}`} value={p.name}>
              {getPresetDisplayLabel(p)} {p.visibility === 'public' ? '[public] ' : ''}{p.versionCount > 1 ? `(v${p.currentVersion})` : ''}
            </option>
          ))}
        </select>

        {selectedPresetSummary && (
          <PresetRatingStars
            value={localRatings[selectedPresetSummary.name] ?? selectedPresetSummary.rating ?? 0}
            onChange={(rating) => { void handleRate(selectedPresetSummary.name, rating); }}
            color={accentColor}
            size={compact ? '0.62rem' : '0.68rem'}
            hitSize={compact ? '0.95rem' : '1.05rem'}
            style={{ gap: 0 }}
          />
        )}

        {poolKey && poolCandidates.length > 0 && (
          <button
            type="button"
            onClick={() => setShowPoolPopup(true)}
            style={{
              ...dropdownStyles.iconBtn,
              color: poolIds.length > 0 ? accentColor ?? '#B8E0FF' : '#8a7a52',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: compact ? 24 : 26,
              height: compact ? 24 : 26,
              padding: 0,
              fontSize: compact ? '0.78rem' : '0.86rem',
              minHeight: compact ? 24 : 26,
            }}
            title={`Edit ${getPresetPoolLabel(poolKey)} preset pool`}
            aria-label={`Edit ${getPresetPoolLabel(poolKey)} preset pool`}
          >
            {PRESET_POOL_ICON}
          </button>
        )}

        {showSaveButton && (
          <button
            type="button"
            onClick={handleSaveClick}
            style={{
              ...dropdownStyles.iconBtn,
              ...(saveButtonLabel ? {
                padding: compact ? '3px 7px' : '4px 9px',
                fontSize: compact ? '0.58rem' : '0.65rem',
                fontWeight: 700,
                lineHeight: 1.1,
                minHeight: compact ? 24 : 26,
                whiteSpace: 'nowrap',
              } : {}),
            }}
            title={saveButtonLabel ?? 'Save preset'}
            onMouseEnter={e => { e.currentTarget.style.color = '#ddd'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#999'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; }}
          >
            {saveButtonLabel ?? '💾'}
          </button>
        )}

        {showFileButtons && (
          <>
            <button
              onClick={handleExport}
              style={dropdownStyles.iconBtn}
              title="Export preset to file"
              onMouseEnter={e => { e.currentTarget.style.color = '#ddd'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#999'; }}
            >
              ↓
            </button>
            <button
              onClick={handleImport}
              style={dropdownStyles.iconBtn}
              title="Import preset from file"
              onMouseEnter={e => { e.currentTarget.style.color = '#ddd'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#999'; }}
            >
              ↑
            </button>
          </>
        )}

        {canChangeVisibility && (
          <button
            onClick={handleToggleVisibility}
            style={{ ...dropdownStyles.iconBtn, color: isSelectedPresetPublic ? '#5f8f5f' : '#8a7a52' }}
            title={isSelectedPresetPublic ? 'Make preset private' : 'Make preset public'}
            onMouseEnter={e => { e.currentTarget.style.color = isSelectedPresetPublic ? '#8fd18f' : '#d5b06a'; }}
            onMouseLeave={e => { e.currentTarget.style.color = isSelectedPresetPublic ? '#5f8f5f' : '#8a7a52'; }}
          >
            {isSelectedPresetPublic ? 'Pub' : 'Pvt'}
          </button>
        )}

        {PRESET_DELETE_ENABLED && selectedName && selectedPresetSummary && (SHARED_PRESET_TEST_MODE || selectedPresetSummary.library !== 'stock') && (
          <button
            onClick={handleDelete}
            style={{ ...dropdownStyles.iconBtn, color: '#664444' }}
            title="Delete preset"
            onMouseEnter={e => { e.currentTarget.style.color = '#ff6666'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#664444'; }}
          >
            ✕
          </button>
        )}
      </div>

      {poolKey && (
        <PresetPoolPopup
          open={showPoolPopup}
          title={`Preset Pool: ${getPresetPoolLabel(poolKey)}`}
          candidates={poolCandidates}
          poolIds={poolIds}
          accentColor={accentColor}
          onChange={setPoolIds}
          onReset={resetPoolIds}
          onClose={() => setShowPoolPopup(false)}
          onAudition={onAudition ? handlePoolAudition : undefined}
          onLoad={handlePoolLoad}
          onDelete={handlePoolDelete}
          onRate={handlePoolRate}
        />
      )}

      {/* Save dialog */}
      {showSaveDialog && (
        <div style={dropdownStyles.saveDialog} onClick={() => setShowSaveDialog(false)}>
          <div style={dropdownStyles.savePanel} onClick={e => e.stopPropagation()}>
            <div style={{ color: '#a5c4d4', fontSize: '0.9rem', marginBottom: '12px', fontWeight: 600 }}>
              {saveDialogTitle ?? `Save ${level} Preset`}
            </div>
            <input
              type="text"
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              placeholder="Preset name"
              style={dropdownStyles.input}
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleSaveConfirm(); if (e.key === 'Escape') setShowSaveDialog(false); }}
            />
            <input
              type="text"
              value={saveNote}
              onChange={e => setSaveNote(e.target.value)}
              placeholder="Version note (optional)"
              style={{ ...dropdownStyles.input, fontSize: '0.8rem' }}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveConfirm(); if (e.key === 'Escape') setShowSaveDialog(false); }}
            />
            <PresetTagEditor
              value={saveTags}
              onChange={setSaveTags}
              suggestions={tagSuggestions}
              accentColor={accentColor}
            />
            {SHARED_PRESET_TEST_MODE ? (
              <div style={{ fontSize: '0.8rem', color: '#999', marginTop: 4 }}>
                Shared testing mode: saves are public for everyone.
              </div>
            ) : (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: '#999', cursor: 'pointer', marginTop: 4 }}>
                <input
                  type="checkbox"
                  checked={savePublic}
                  onChange={e => setSavePublic(e.target.checked)}
                  style={{ accentColor: accentColor || '#2a5a8a' }}
                />
                Share publicly
              </label>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button
                onClick={() => setShowSaveDialog(false)}
                style={{
                  ...dropdownStyles.dialogBtn,
                  background: 'rgba(255,255,255,0.05)',
                  borderColor: 'rgba(244,237,228,0.12)',
                  color: 'rgba(244,237,228,0.66)',
                }}
              >
                Cancel
              </button>
              {canRenameSelectedPreset && (
                <button
                  onClick={handleRenameConfirm}
                  disabled={!saveName.trim() || saveName.trim() === selectedName}
                  style={{
                    ...dropdownStyles.dialogBtn,
                    background: saveName.trim() && saveName.trim() !== selectedName
                      ? 'rgba(214,178,111,0.14)'
                      : 'rgba(255,255,255,0.04)',
                    borderColor: saveName.trim() && saveName.trim() !== selectedName
                      ? 'rgba(214,178,111,0.34)'
                      : 'rgba(255,255,255,0.08)',
                    color: saveName.trim() && saveName.trim() !== selectedName
                      ? '#d6b26f'
                      : 'rgba(244,237,228,0.32)',
                  }}
                  title="Rename the selected preset without changing its preset ID"
                >
                  Rename
                </button>
              )}
              <button
                onClick={handleSaveConfirm}
                style={{
                  ...dropdownStyles.dialogBtn,
                  background: 'rgba(184,224,255,0.14)',
                  borderColor: 'rgba(184,224,255,0.34)',
                  color: '#B8E0FF',
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
