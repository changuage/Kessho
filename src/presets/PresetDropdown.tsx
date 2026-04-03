// src/presets/PresetDropdown.tsx
// Phase 3 + 8 + 9 — Reusable preset dropdown with save/export/import/versioning/dirty flag.
// Matches existing app styling (native <select>, dark theme, CSS custom properties).

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import type { PresetLevel, PresetEntry, PresetSummary } from './types';
import { usePresets } from './usePresets';
import { exportPresetToFile, importPresetFromFile } from './fileIO';
import { getPresetStore } from './PresetStore';
import { extractPresetVersionMetadata, isPresetCompatibleWithSlot } from './presetUtils';
import { getPresetDisplayLabel } from './catalog';
import { getVersionData } from './codec';
import type { SliderState } from '../ui/state';
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
    minWidth: '280px',
    maxWidth: '400px',
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
}) => {
  const { presets, save, load, remove, refresh, extract, apply } = usePresets(level, scope, presetOptions);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveNote, setSaveNote] = useState('');
  const [savePublic, setSavePublic] = useState(false);
  const [selectedName, setSelectedName] = useState(currentName || '');
  const [loadedEntry, setLoadedEntry] = useState<PresetEntry | null>(null);
  const [loadedData, setLoadedData] = useState<Record<string, unknown> | null>(null);
  const selectedPresetSummary = useMemo<PresetSummary | null>(() => {
    if (!selectedName) return null;
    return presets.find(p => p.name === selectedName) ?? null;
  }, [presets, selectedName]);
  const canChangeVisibility = selectedPresetSummary?.library === 'user';
  const isSelectedPresetPublic = selectedPresetSummary?.visibility === 'public';

  // Dirty detection: compare current state params against last loaded version
  const isDirty = useMemo(() => {
    if (!loadedEntry || !loadedData) return false;
    const currentParams = extract(state);
    for (const key of Object.keys(loadedData)) {
      const saved = loadedData[key];
      const current = currentParams[key];
      // Tolerate small floating point differences
      if (typeof saved === 'number' && typeof current === 'number') {
        if (Math.abs(saved - current) > 1e-6) return true;
      } else if (saved !== current) {
        return true;
      }
    }
    return false;
  }, [loadedEntry, loadedData, state, extract]);

  useEffect(() => {
    setSelectedName(currentName || '');
  }, [currentName]);

  // Handle preset selection from dropdown
  const handleSelect = useCallback(async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const name = e.target.value;
    if (!name) return;
    setSelectedName(name);
    const entry = await load(name);
    if (!entry) return;

    // Get latest version data (reconstituted from delta if compressed)
    const versionData = getVersionData(entry);
    if (!versionData) return;

    setLoadedEntry(entry);
    setLoadedData(versionData);
    onLoad(entry, versionData);

    // Apply params to state and notify
    if (onStateChange) {
      const newState = apply(state, versionData);
      onStateChange(newState);
    }
  }, [load, apply, state, onLoad, onStateChange]);

  // Open save dialog
  const handleSaveClick = useCallback(() => {
    setSaveName(selectedName || `My ${scope || level} Preset`);
    setSaveNote('');
    setSavePublic(selectedPresetSummary?.visibility === 'public');
    setShowSaveDialog(true);
  }, [selectedName, scope, level, selectedPresetSummary]);

  // Confirm save
  const handleSaveConfirm = useCallback(async () => {
    if (!saveName.trim()) return;
    const version = loadedEntry?.versions.find(v => v.v === loadedEntry.currentVersion)
      || loadedEntry?.versions[loadedEntry.versions.length - 1];
    const trimmedName = saveName.trim();
    const actualName = loadedEntry?.author !== 'user' && trimmedName === selectedName
      ? `${trimmedName} (Custom)`
      : trimmedName;
    await save(
      trimmedName,
      state,
      saveNote.trim() || undefined,
      undefined,
      extractPresetVersionMetadata(version),
      savePublic ? { visibility: 'public' } : { visibility: 'private' },
    );
    await refresh();
    const savedEntry = await load(actualName);
    setLoadedEntry(savedEntry ?? null);
    // Update loadedData so dirty flag resets
    if (savedEntry) {
      const verData = getVersionData(savedEntry);
      setLoadedData(verData ?? null);
    } else {
      setLoadedData(null);
    }
    setSelectedName(savedEntry?.name ?? actualName);
    setShowSaveDialog(false);
  }, [saveName, saveNote, savePublic, state, save, loadedEntry, selectedName, refresh, load]);

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
    const versionData = getVersionData(selectedEntry);
    if (!versionData) return;
    setSelectedName(entry.name);
    setLoadedEntry(selectedEntry);
    setLoadedData(versionData);
    onLoad(selectedEntry, versionData);
    if (onStateChange) {
      const newState = apply(state, versionData);
      onStateChange(newState);
    }
  }, [refresh, load, apply, state, onLoad, onStateChange]);

  // Delete selected preset
  const handleDelete = useCallback(async () => {
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
    if (!selectedName) return;
    const entry = await load(selectedName);
    if (!entry) return;

    entry.visibility = entry.visibility === 'public' ? 'private' : 'public';
    await getPresetStore().save(entry);
    await refresh();
    setLoadedEntry(entry);
  }, [selectedName, load, refresh]);

  // Separate built-in and user presets
  const stockPresets = presets.filter(p => p.creator === 'Kessho');
  const userPresets = presets.filter(p => p.library === 'user' && p.creator !== 'Kessho');
  const cloudPresets = presets.filter(p => p.library === 'cloud');

  const selectStyle: React.CSSProperties = {
    ...dropdownStyles.select,
    ...(compact ? { fontSize: '0.7rem', padding: '2px 4px' } : {}),
    ...(accentColor ? { borderColor: `${accentColor}33` } : {}),
    ...(isDirty ? { borderColor: '#c9913666' } : {}),
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
          {stockPresets.length > 0 && (
            <optgroup label="Stock">
              {stockPresets.map(p => (
                <option key={`s:${p.name}`} value={p.name}>
                  {getPresetDisplayLabel(p)}
                </option>
              ))}
            </optgroup>
          )}
          {userPresets.length > 0 && (
            <optgroup label="User">
              {userPresets.map(p => (
                <option key={`u:${p.name}`} value={p.name}>
                  {getPresetDisplayLabel(p)} {p.visibility === 'public' ? '[public] ' : ''}{p.versionCount > 1 ? `(v${p.currentVersion})` : ''}
                </option>
              ))}
            </optgroup>
          )}
          {cloudPresets.length > 0 && (
            <optgroup label="Cloud">
              {cloudPresets.map(p => (
                <option key={`c:${p.name}`} value={p.name}>
                  {getPresetDisplayLabel(p)}
                </option>
              ))}
            </optgroup>
          )}
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

        {selectedName && userPresets.some(p => p.name === selectedName) && (
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
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: '#999', cursor: 'pointer', marginTop: 4 }}>
              <input
                type="checkbox"
                checked={savePublic}
                onChange={e => setSavePublic(e.target.checked)}
                style={{ accentColor: accentColor || '#2a5a8a' }}
              />
              Share publicly
            </label>
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
