// src/presets/PresetDropdown.tsx
// Phase 3 + 8 + 9 — Reusable preset dropdown with save/export/import/versioning/dirty flag.
// Matches existing app styling (native <select>, dark theme, CSS custom properties).

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import type { PresetLevel, PresetEntry } from './types';
import { usePresets } from './usePresets';
import { usePresetVersioning } from './usePresetVersioning';
import { exportPresetToFile, importPresetFromFile } from './fileIO';
import { getPresetStore } from './PresetStore';
import type { ParamLevel } from './ParamRegistry';
import type { SliderState } from '../ui/state';

function levelToParamLevel(level: PresetLevel): ParamLevel {
  switch (level) {
    case 'engine': return 1;
    case 'kit': return 2;
    case 'source': return 3;
    case 'state': return 4;
    case 'journey': return 4;
  }
}

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
  compact = false,
}) => {
  const { presets, save, load, remove, refresh, apply } = usePresets(level, scope);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveNote, setSaveNote] = useState('');
  const [selectedName, setSelectedName] = useState(currentName || '');

  // Handle preset selection from dropdown
  const handleSelect = useCallback(async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const name = e.target.value;
    if (!name) return;
    setSelectedName(name);
    const entry = await load(name);
    if (!entry) return;

    // Get latest version data
    const version = entry.versions.find(v => v.v === entry.currentVersion) || entry.versions[entry.versions.length - 1];
    if (!version) return;

    onLoad(entry, version.data);

    // Apply params to state and notify
    if (onStateChange) {
      const newState = apply(state, version.data);
      onStateChange(newState);
    }
  }, [load, apply, state, onLoad, onStateChange]);

  // Open save dialog
  const handleSaveClick = useCallback(() => {
    setSaveName(selectedName || `My ${scope || level} Preset`);
    setSaveNote('');
    setShowSaveDialog(true);
  }, [selectedName, scope, level]);

  // Confirm save
  const handleSaveConfirm = useCallback(async () => {
    if (!saveName.trim()) return;
    await save(saveName.trim(), state, saveNote.trim() || undefined);
    setSelectedName(saveName.trim());
    setShowSaveDialog(false);
  }, [saveName, saveNote, state, save]);

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

    // Save to store
    const store = getPresetStore();
    await store.save(entry);
    await refresh();

    // Load it
    const version = entry.versions[entry.versions.length - 1];
    setSelectedName(entry.name);
    onLoad(entry, version.data);
    if (onStateChange) {
      const newState = apply(state, version.data);
      onStateChange(newState);
    }
  }, [refresh, apply, state, onLoad, onStateChange]);

  // Delete selected preset
  const handleDelete = useCallback(async () => {
    if (!selectedName) return;
    const entry = await load(selectedName);
    if (!entry || entry.author === 'factory') return;
    if (!confirm(`Delete preset "${selectedName}"?`)) return;
    await remove(selectedName);
    setSelectedName('');
  }, [selectedName, load, remove]);

  // Separate factory and user presets
  const factoryPresets = presets.filter(p => p.author === 'factory');
  const userPresets = presets.filter(p => p.author === 'user');

  const selectStyle: React.CSSProperties = {
    ...dropdownStyles.select,
    ...(compact ? { fontSize: '0.7rem', padding: '2px 4px' } : {}),
    ...(accentColor ? { borderColor: `${accentColor}33` } : {}),
  };

  return (
    <>
      <div className={className} style={dropdownStyles.container}>
        <select
          value={selectedName}
          onChange={handleSelect}
          style={selectStyle}
          title={`${level} preset`}
        >
          <option value="">— Select —</option>
          {factoryPresets.length > 0 && (
            <optgroup label="Factory">
              {factoryPresets.map(p => (
                <option key={`f:${p.name}`} value={p.name}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          )}
          {userPresets.length > 0 && (
            <optgroup label="User">
              {userPresets.map(p => (
                <option key={`u:${p.name}`} value={p.name}>
                  {p.name} {p.versionCount > 1 ? `(v${p.currentVersion})` : ''}
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
