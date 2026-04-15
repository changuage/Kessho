// src/presets/PresetDropdown.tsx
// Phase 3 + 8 + 9 — Reusable preset dropdown with save/export/import/versioning/dirty flag.
// Matches existing app styling (native <select>, dark theme, CSS custom properties).

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import type { PresetLevel, PresetEntry, PresetSummary } from './types';
import { usePresets } from './usePresets';
import { exportPresetToFile, importPresetFromFile } from './fileIO';
import { getPresetStore } from './PresetStore';
import { extractPresetVersionMetadata, isPresetCompatibleWithSlot, presetValuesEqual } from './presetUtils';
import { getPresetDisplayLabel } from './catalog';
import { getVersionData } from './codec';
import { SHARED_PRESET_TEST_MODE } from './sharedMode';
import { DEFAULT_STATE, type SliderMode, type SliderState } from '../ui/state';
import type { UsePresetsOptions } from './usePresets';

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
  onLoad: (entry: PresetEntry, data: Record<string, unknown>) => void;
  /** Called when state is updated after applying preset */
  onStateChange?: (newState: SliderState) => void;
  /** Optional: accent color for focus ring */
  accentColor?: string;
  /** Optional: additional CSS class */
  className?: string;
  /** Whether to show export/import buttons. Default: true */
  showFileButtons?: boolean;
  /** Whether to show the save button. Default: true */
  showSaveButton?: boolean;
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
    gap: '4px',
    minWidth: 0,
  },
  select: {
    flex: 1,
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
    background: '#1a1a2e',
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
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.8rem',
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

export const PresetDropdown: React.FC<PresetDropdownProps> = ({
  level,
  scope,
  state,
  currentName,
  onLoad,
  onStateChange,
  accentColor,
  className,
  showFileButtons = true,
  showSaveButton = true,
  presetOptions,
  compact = false,
  sliderModes,
  dualSliderRanges,
  onDualStateChange,
}) => {
  const { presets, save, load, remove, refresh, extract, apply } = usePresets(level, scope, presetOptions);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveNote, setSaveNote] = useState('');
  const [savePublic, setSavePublic] = useState(SHARED_PRESET_TEST_MODE);
  const [selectedName, setSelectedName] = useState(currentName || '');
  const [loadedEntry, setLoadedEntry] = useState<PresetEntry | null>(null);
  const [loadedData, setLoadedData] = useState<Record<string, unknown> | null>(null);
  const dedupedPresets = useMemo(() => dedupePresetSummaries(presets), [presets]);
  const sortedPresets = useMemo(
    () => [...dedupedPresets].sort((left, right) => left.name.localeCompare(right.name)),
    [dedupedPresets],
  );
  const selectedPresetSummary = useMemo<PresetSummary | null>(() => {
    if (!selectedName) return null;
    return sortedPresets.find(p => p.name === selectedName) ?? null;
  }, [sortedPresets, selectedName]);
  const canChangeVisibility = !SHARED_PRESET_TEST_MODE && selectedPresetSummary?.library !== 'stock';
  const isSelectedPresetPublic = selectedPresetSummary?.visibility === 'public';

  const canonicalizeLoadedData = useCallback((data: Record<string, unknown>) => {
    const canonicalState = apply(DEFAULT_STATE, data);
    return extract(canonicalState);
  }, [apply, extract]);

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

  // Handle preset selection from dropdown
  const handleSelect = useCallback(async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const name = e.target.value;
    if (!name) return;
    setSelectedName(name);
    const entry = await load(name);
    if (!entry) return;
    const version = getSelectedVersion(entry);
    if (!version) return;

    // Get latest version data (reconstituted from delta if compressed)
    const versionData = getVersionData(entry);
    if (!versionData) return;

    setLoadedEntry(entry);
    setLoadedData(canonicalizeLoadedData(versionData));
    onLoad(entry, versionData);

    // Apply params to state and notify
    if (onStateChange) {
      const newState = apply(state, versionData);
      onStateChange(newState);
    }
    onDualStateChange?.(
      Object.keys(versionData),
      version.dualRanges,
      version.sliderModes as Record<string, SliderMode> | undefined,
    );
  }, [load, getSelectedVersion, apply, state, onLoad, onStateChange, onDualStateChange, canonicalizeLoadedData]);

  // Open save dialog
  const handleSaveClick = useCallback(() => {
    setSaveName(selectedName || `My ${scope || level} Preset`);
    setSaveNote('');
    setSavePublic(SHARED_PRESET_TEST_MODE || selectedPresetSummary?.visibility === 'public');
    setShowSaveDialog(true);
  }, [selectedName, scope, level, selectedPresetSummary]);

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
      undefined,
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
  }, [saveName, saveNote, savePublic, state, save, loadedEntry, selectedName, refresh, load, getSelectedVersion, extractCurrentDualMetadata, extract, canonicalizeLoadedData]);

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
    const selectedEntry = savedEntry ?? entry;
    const selectedVersion = getSelectedVersion(selectedEntry);
    if (!selectedVersion) return;
    const versionData = getVersionData(selectedEntry);
    if (!versionData) return;
    setSelectedName(entry.name);
    setLoadedEntry(selectedEntry);
    setLoadedData(canonicalizeLoadedData(versionData));
    onLoad(selectedEntry, versionData);
    if (onStateChange) {
      const newState = apply(state, versionData);
      onStateChange(newState);
    }
    onDualStateChange?.(
      Object.keys(versionData),
      selectedVersion.dualRanges,
      selectedVersion.sliderModes as Record<string, SliderMode> | undefined,
    );
  }, [refresh, load, getSelectedVersion, apply, state, onLoad, onStateChange, onDualStateChange, canonicalizeLoadedData]);

  // Delete selected preset
  const handleDelete = useCallback(async () => {
    if (SHARED_PRESET_TEST_MODE) return;
    if (!selectedName) return;
    const entry = await load(selectedName);
    if (!entry) return;
    if (!confirm(`Delete preset "${selectedName}"?`)) return;
    await remove(selectedName);
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

  const selectBorderColor = isDirty
    ? '#c9913666'
    : accentColor
      ? `${accentColor}33`
      : 'rgba(255, 255, 255, 0.15)';

  const selectStyle: React.CSSProperties = {
    ...dropdownStyles.select,
    ...(compact ? { fontSize: '0.7rem', padding: '2px 4px' } : {}),
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
        <select
          value={selectedName}
          onChange={handleSelect}
          style={selectStyle}
          title={`${level} preset`}
        >
          <option value="">— Select —</option>
          {sortedPresets.map(p => (
            <option key={`${p.library}:${p.name}`} value={p.name}>
              {getPresetDisplayLabel(p)} {p.visibility === 'public' ? '[public] ' : ''}{p.versionCount > 1 ? `(v${p.currentVersion})` : ''}
            </option>
          ))}
        </select>

        {showSaveButton && (
          <button
            onClick={handleSaveClick}
            style={dropdownStyles.iconBtn}
            title="Save preset"
            onMouseEnter={e => { e.currentTarget.style.color = '#ddd'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#999'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; }}
          >
            💾
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

        {!SHARED_PRESET_TEST_MODE && selectedName && selectedPresetSummary && selectedPresetSummary.library !== 'stock' && (
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

      {/* Save dialog */}
      {showSaveDialog && (
        <div style={dropdownStyles.saveDialog} onClick={() => setShowSaveDialog(false)}>
          <div style={dropdownStyles.savePanel} onClick={e => e.stopPropagation()}>
            <div style={{ color: '#a5c4d4', fontSize: '0.9rem', marginBottom: '12px', fontWeight: 600 }}>
              Save {level} Preset
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
                style={{ ...dropdownStyles.dialogBtn, background: 'rgba(255,255,255,0.08)', color: '#999' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveConfirm}
                style={{ ...dropdownStyles.dialogBtn, background: '#2a5a8a', color: 'white' }}
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
