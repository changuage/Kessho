import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PRESET_DELETE_ENABLED, SHARED_PRESET_TEST_MODE } from './sharedMode';
import { PresetRatingStars } from './PresetRatingStars';
import { PresetTagEditor } from './PresetTagEditor';
import { blurSelectAfterChange } from '../ui/shared/selectFocus';
import type { SliderState } from '../ui/state';
import type { PresetEntry, PresetSummary, PresetVersionMetadata } from './types';
import type { UsePresetsResult } from './usePresets';
import { getPresetCommandErrorMessage } from './presetCommands';
import { getPresetVersionDiffKeys } from './presetDiffSemantics';

export type PresetManagerRepository = Pick<
  UsePresetsResult,
  'presets' | 'save' | 'load' | 'remove' | 'rename' | 'updateMetadata'
>;

export interface PresetManagerOption {
  value: string;
  label: string;
  key?: string;
  group?: string;
  summary?: PresetSummary;
}

export interface PresetManagerDomainAdapter {
  saveNote: string;
  saveAsNote: string;
  overwriteNote: string;
  valueForEntry: (entry: PresetEntry) => string;
  onSaved?: (entry: PresetEntry) => void | Promise<void>;
  onRenamed?: (entry: PresetEntry, previousName: string) => void | Promise<void>;
  applyToSlot: (slot: 'A' | 'B', value: string) => void;
  getSaveMetadata?: () => PresetVersionMetadata | undefined;
  canRate: (option: PresetManagerOption, summary: PresetSummary | undefined) => boolean;
  rate: (option: PresetManagerOption, rating: number) => Promise<void>;
}

export interface PresetManagerVariationControls {
  canArm: boolean;
  canVariant: boolean;
  canUndo: boolean;
  walkEnabled: boolean;
  targetReady: boolean;
  endpointLabel: 'A' | 'B' | null;
  progressText?: string;
  disabledReason?: string;
  onRandom: () => void;
  onWalkToggle: () => void;
  onVariant: () => void;
  onUndo: () => void;
}

export interface PresetManagerControllerOptions {
  repository: PresetManagerRepository;
  options: PresetManagerOption[];
  initialValue: string;
  scopeKey: string;
  state: SliderState;
  adapter: PresetManagerDomainAdapter;
}

export interface PresetManagerController {
  repository: PresetManagerRepository;
  options: PresetManagerOption[];
  sortedOptions: PresetManagerOption[];
  selectedValue: string;
  selectedOption: PresetManagerOption | null;
  selectedEntryName: string;
  selectedSummary: PresetSummary | undefined;
  localRatings: Record<string, number>;
  tagSuggestions: string[];
  saveDialog: { originalName: string } | null;
  saveAsName: string;
  saveTags: string[];
  confirm: { message: string; onConfirm: () => void | Promise<void> } | null;
  mutationBusy: boolean;
  mutationError: string;
  showVersions: boolean;
  versionEntry: PresetEntry | null;
  lastVersions: PresetEntry['versions'];
  setSelectedValue: (value: string) => void;
  setSaveAsName: (value: string) => void;
  setSaveTags: (tags: string[]) => void;
  setSaveDialog: (dialog: { originalName: string } | null) => void;
  setConfirm: (confirm: { message: string; onConfirm: () => void | Promise<void> } | null) => void;
  openSaveDialog: () => void;
  toggleVersions: () => void;
  loadToSlot: (slot: 'A' | 'B') => void;
  saveOverwrite: () => Promise<void>;
  saveAs: () => Promise<void>;
  rename: () => Promise<void>;
  deleteSelected: () => void;
  rateSelected: (rating: number) => Promise<void>;
  canRate: (option: PresetManagerOption, summary: PresetSummary | undefined) => boolean;
  getVersionDiffs: (entry: PresetEntry, version: number) => { fromV1: string[]; fromPrev: string[] };
}

const humanize = (key: string) =>
  key.replace(/([A-Z])/g, ' $1').replace(/^./, character => character.toUpperCase()).trim();

export function usePresetManagerController({
  repository,
  options,
  initialValue,
  scopeKey,
  state,
  adapter,
}: PresetManagerControllerOptions): PresetManagerController {
  const [selectedValue, setSelectedValue] = useState(initialValue);
  const [saveDialog, setSaveDialog] = useState<{ originalName: string } | null>(null);
  const [saveAsName, setSaveAsName] = useState('');
  const [saveTags, setSaveTags] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<{ message: string; onConfirm: () => void | Promise<void> } | null>(null);
  const [versionEntry, setVersionEntry] = useState<PresetEntry | null>(null);
  const [showVersions, setShowVersions] = useState(false);
  const [localRatings, setLocalRatings] = useState<Record<string, number>>({});
  const [mutationBusy, setMutationBusy] = useState(false);
  const [mutationError, setMutationError] = useState('');
  const mutationBusyRef = useRef(false);

  const selectedOption = useMemo(
    () => options.find(option => option.value === selectedValue) ?? null,
    [options, selectedValue],
  );
  const selectedEntryName = selectedOption?.label ?? selectedValue;
  const selectedSummary = useMemo(
    () => selectedOption?.summary ?? repository.presets.find(preset => preset.name === selectedEntryName),
    [repository.presets, selectedEntryName, selectedOption],
  );
  const sortedOptions = useMemo(
    () => [...options].sort((left, right) => left.label.localeCompare(right.label)),
    [options],
  );
  const tagSuggestions = useMemo(() => {
    const tags = new Set<string>();
    for (const preset of repository.presets) {
      for (const tag of preset.tags ?? []) tags.add(tag);
    }
    return [...tags].sort((left, right) => left.localeCompare(right));
  }, [repository.presets]);

  useEffect(() => {
    setSelectedValue(initialValue || '');
    setSaveDialog(null);
    setConfirm(null);
    setVersionEntry(null);
    setShowVersions(false);
    setMutationError('');
  }, [initialValue, scopeKey]);

  const runMutation = useCallback(async (operation: () => Promise<void>): Promise<boolean> => {
    if (mutationBusyRef.current) return false;
    mutationBusyRef.current = true;
    setMutationBusy(true);
    setMutationError('');
    try {
      await operation();
      return true;
    } catch (error) {
      setMutationError(getPresetCommandErrorMessage(error));
      return false;
    } finally {
      mutationBusyRef.current = false;
      setMutationBusy(false);
    }
  }, []);

  const getVersionDiffs = useCallback((entry: PresetEntry, versionNum: number) => {
    const sorted = [...entry.versions].sort((left, right) => left.v - right.v);
    const targetIndex = sorted.findIndex(version => version.v === versionNum);
    if (targetIndex < 0) return { fromV1: [], fromPrev: [] };
    const v1 = sorted[0];
    const previous = targetIndex > 0 ? sorted[targetIndex - 1] : undefined;
    const fromV1 = v1 ? getPresetVersionDiffKeys(entry, v1.v, versionNum).map(humanize) : [];
    const fromPrev = previous ? getPresetVersionDiffKeys(entry, previous.v, versionNum).map(humanize) : [];
    return { fromV1, fromPrev };
  }, []);

  const commitSavedEntry = useCallback(async (entry: PresetEntry, mode: 'overwrite' | 'saveAs') => {
    await adapter.onSaved?.(entry);
    setVersionEntry(entry);
    setSelectedValue(adapter.valueForEntry(entry));
    if (mode === 'saveAs') setSaveAsName('');
    return entry;
  }, [adapter]);

  const saveOverwrite = useCallback(async () => {
    if (!saveDialog) return;
    await runMutation(async () => {
      const entry = await repository.save(saveDialog.originalName, state, adapter.overwriteNote, saveTags, adapter.getSaveMetadata?.());
      if (!entry) throw new Error(`Preset "${saveDialog.originalName}" was not saved.`);
      await commitSavedEntry(entry, 'overwrite');
      setSaveDialog(null);
    });
  }, [adapter.getSaveMetadata, adapter.overwriteNote, commitSavedEntry, repository, runMutation, saveDialog, saveTags, state]);

  const saveAs = useCallback(async () => {
    const targetName = saveAsName.trim();
    if (!targetName) return;
    if (repository.presets.some(preset => preset.name === targetName)) {
      setSaveDialog(null);
      setConfirm({
        message: `"${targetName}" already exists. Overwrite?`,
        onConfirm: async () => {
          await runMutation(async () => {
            const entry = await repository.save(targetName, state, adapter.overwriteNote, saveTags, adapter.getSaveMetadata?.());
            if (!entry) throw new Error(`Preset "${targetName}" was not saved.`);
            await commitSavedEntry(entry, 'saveAs');
            setConfirm(null);
          });
        },
      });
      return;
    }
    await runMutation(async () => {
      const entry = await repository.save(targetName, state, adapter.saveAsNote, saveTags, adapter.getSaveMetadata?.());
      if (!entry) throw new Error(`Preset "${targetName}" was not saved.`);
      await commitSavedEntry(entry, 'saveAs');
      setSaveDialog(null);
    });
  }, [adapter.getSaveMetadata, adapter.overwriteNote, adapter.saveAsNote, commitSavedEntry, repository, runMutation, saveAsName, saveTags, state]);

  const renamePreset = useCallback(async () => {
    if (!saveDialog) return;
    const targetName = saveAsName.trim();
    if (!targetName || targetName === saveDialog.originalName) return;
    await runMutation(async () => {
      const renamed = await repository.rename(saveDialog.originalName, targetName, { tags: saveTags });
      if (!renamed) throw new Error(`Preset "${saveDialog.originalName}" was not renamed.`);
      await adapter.onRenamed?.(renamed, saveDialog.originalName);
      setSelectedValue(adapter.valueForEntry(renamed));
      setVersionEntry(renamed);
      setSaveDialog(null);
      setSaveAsName('');
    });
  }, [adapter, repository, runMutation, saveAsName, saveDialog, saveTags]);

  const toggleVersions = useCallback(async () => {
    if (showVersions) {
      setShowVersions(false);
      return;
    }
    if (!selectedEntryName) return;
    const entry = await repository.load(selectedEntryName);
    if (entry) setVersionEntry(entry);
    setShowVersions(true);
  }, [repository, selectedEntryName, showVersions]);

  const loadToSlot = useCallback((slot: 'A' | 'B') => {
    if (selectedOption) adapter.applyToSlot(slot, selectedOption.value);
  }, [adapter, selectedOption]);

  const rateSelected = useCallback(async (rating: number) => {
    if (!selectedOption) return;
    const key = selectedSummary?.name ?? selectedOption.label;
    try {
      await adapter.rate(selectedOption, rating);
      setLocalRatings(previous => ({ ...previous, [key]: rating }));
    } catch (ratingError) {
      console.warn('Failed to update preset rating:', ratingError);
    }
  }, [adapter, selectedOption, selectedSummary?.name]);

  const deleteSelected = useCallback(() => {
    if (!selectedEntryName) return;
    setMutationError('');
    setConfirm({
      message: `Delete "${selectedEntryName}"?`,
      onConfirm: async () => {
        await runMutation(async () => {
          const removed = await repository.remove(selectedEntryName);
          if (!removed) throw new Error(`Preset "${selectedEntryName}" was not deleted.`);
          setConfirm(null);
          setSelectedValue('');
          setShowVersions(false);
          setVersionEntry(null);
        });
      },
    });
  }, [repository, runMutation, selectedEntryName]);

  const openSaveDialog = useCallback(() => {
    if (mutationBusyRef.current) return;
    setMutationError('');
    setSaveAsName('');
    setSaveTags(selectedSummary?.tags ?? []);
    setSaveDialog({ originalName: selectedEntryName });
  }, [selectedEntryName, selectedSummary?.tags]);

  const lastVersions = useMemo(
    () => (versionEntry ? [...versionEntry.versions].sort((left, right) => left.v - right.v).slice(-3) : []),
    [versionEntry],
  );

  return {
    repository,
    options,
    sortedOptions,
    selectedValue,
    selectedOption,
    selectedEntryName,
    selectedSummary,
    localRatings,
    tagSuggestions,
    saveDialog,
    saveAsName,
    saveTags,
    confirm,
    mutationBusy,
    mutationError,
    showVersions,
    versionEntry,
    lastVersions,
    setSelectedValue,
    setSaveAsName,
    setSaveTags,
    setSaveDialog,
    setConfirm,
    openSaveDialog,
    toggleVersions,
    loadToSlot,
    saveOverwrite,
    saveAs,
    rename: renamePreset,
    deleteSelected,
    rateSelected,
    canRate: adapter.canRate,
    getVersionDiffs,
  };
}

const s: Record<string, React.CSSProperties> = {
  root: { padding: '4px 0', marginBottom: 2 },
  drumRoot: { padding: '6px 0 4px', borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: 2 },
  header: { fontSize: '0.6rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 },
  select: { flex: 1, minWidth: 0, fontSize: '0.75rem', background: 'rgba(0, 0, 0, 0.3)', color: '#ccc', border: '1px solid rgba(255, 255, 255, 0.15)', borderRadius: 4, padding: '3px 6px', cursor: 'pointer', colorScheme: 'dark' },
  presetRow: { display: 'flex', alignItems: 'center', gap: 6, padding: '3px 4px', borderRadius: 4, fontSize: '0.75rem', color: '#ccc' },
  versionBadge: { fontSize: '0.6rem', color: '#666', flexShrink: 0 },
  slotBtn: { background: 'none', borderWidth: 1, borderStyle: 'solid', borderRadius: 3, cursor: 'pointer', padding: '3px 8px', fontSize: '0.6rem', fontWeight: 700, lineHeight: 1.2, transition: 'color 0.15s, border-color 0.15s, background 0.15s', flexShrink: 0, minWidth: 26, minHeight: 22, textAlign: 'center' },
  slotA: { color: '#7eb8d0', borderColor: 'rgba(126,184,208,0.3)' },
  slotB: { color: '#d0a87e', borderColor: 'rgba(208,168,126,0.3)' },
  saveBtn: { background: 'none', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 3, cursor: 'pointer', padding: '3px 6px', fontSize: '0.6rem', lineHeight: 1.2, flexShrink: 0, minWidth: 26, minHeight: 22, color: '#5f8f5f' },
  deleteBtn: { background: 'none', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 3, cursor: 'pointer', padding: '3px 6px', fontSize: '0.6rem', lineHeight: 1.2, flexShrink: 0, minWidth: 26, minHeight: 22, color: '#8f5f5f' },
  poolBtn: { background: 'none', border: '1px solid rgba(165,196,212,0.35)', borderRadius: 3, cursor: 'pointer', padding: '3px 6px', fontSize: '0.72rem', lineHeight: 1.2, flexShrink: 0, minWidth: 26, minHeight: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
  expandBtn: { background: 'none', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 3, cursor: 'pointer', padding: '3px 6px', fontSize: '0.6rem', lineHeight: 1.2, flexShrink: 0, minWidth: 26, minHeight: 22, color: '#888' },
  versionRow: { display: 'flex', alignItems: 'center', gap: 4, padding: '1px 4px 1px 10px', fontSize: '0.6rem', color: '#777' },
  diffSummary: { fontSize: '0.55rem', color: '#666', padding: '0 4px 2px 18px', lineHeight: 1.3 },
  input: { width: '100%', padding: '5px 8px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(0,0,0,0.3)', color: 'white', fontSize: '0.72rem', boxSizing: 'border-box', marginBottom: 6 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 },
  dialog: { background: '#171615', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: 14, minWidth: 240, maxWidth: 340, color: '#ccc', fontSize: '0.78rem' },
  dialogTitle: { fontSize: '0.8rem', fontWeight: 600, color: '#a5c4d4', marginBottom: 8 },
  dialogBtnRow: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 },
  dialogBtn: { padding: '5px 14px', borderRadius: 4, border: '1px solid rgba(244,237,228,0.12)', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700 },
  variationRow: { display: 'flex', alignItems: 'center', gap: 4, padding: '2px 4px 0', fontSize: '0.6rem' },
  variationBtn: { background: 'none', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 3, cursor: 'pointer', padding: '2px 6px', fontSize: '0.58rem', lineHeight: 1.2 },
  variationStatus: { color: '#777', marginLeft: 3, whiteSpace: 'nowrap' },
  mutationError: { margin: '4px 4px 0', color: '#e4a0a0', fontSize: '0.62rem', lineHeight: 1.35 },
};

function renderOptionGroups(options: PresetManagerOption[]) {
  const groups = new Map<string, PresetManagerOption[]>();
  for (const option of options) {
    const group = option.group ?? '';
    const list = groups.get(group) ?? [];
    list.push(option);
    groups.set(group, list);
  }
  return [...groups.entries()].map(([group, groupOptions]) => group
    ? <optgroup key={group} label={group}>{groupOptions.map(option => <option key={option.key ?? option.value} value={option.value}>{option.label}</option>)}</optgroup>
    : groupOptions.map(option => <option key={option.key ?? option.value} value={option.value}>{option.label}</option>));
}

export interface PresetManagerPanelProps {
  controller: PresetManagerController;
  color: string;
  accentColor?: string;
  header?: string;
  slotALabel?: string;
  slotBLabel?: string;
  onOpenPool?: () => void;
  poolButtonTitle?: string;
  poolButtonAriaLabel?: string;
  poolButtonLabel?: React.ReactNode;
  variationControls?: PresetManagerVariationControls;
}

export function PresetManagerPanel({
  controller,
  color,
  accentColor = '#B8E0FF',
  header,
  slotALabel = 'A',
  slotBLabel = 'B',
  onOpenPool,
  poolButtonTitle = 'Edit preset pool',
  poolButtonAriaLabel = 'Edit preset pool',
  poolButtonLabel = '⚙',
  variationControls,
}: PresetManagerPanelProps) {
  const { selectedOption, selectedSummary } = controller;
  const ratingKey = selectedSummary?.name ?? selectedOption?.label ?? controller.selectedEntryName;
  const rootStyle = header ? s.drumRoot : s.root;
  const select = (
    <select
      value={controller.selectedValue}
      onChange={event => {
        controller.setSelectedValue(event.target.value);
        blurSelectAfterChange(event.currentTarget);
      }}
      style={s.select}
      title="Select preset"
    >
      <option value="">— Select Preset —</option>
      {renderOptionGroups(controller.sortedOptions)}
    </select>
  );

  return (
    <div style={rootStyle}>
      {header && <div style={s.header}>{header}</div>}
      {controller.selectedValue ? (
        <>
          <div style={s.presetRow}>
            {select}
          </div>
        </>
      ) : <div style={s.presetRow}>{select}</div>}
      {variationControls && (
        <div style={s.variationRow}>
          <button type="button" style={{ ...s.variationBtn, color: variationControls.canArm ? '#c6c6c6' : '#666', opacity: variationControls.canArm ? 1 : 0.55 }} disabled={!variationControls.canArm} onClick={variationControls.onRandom}>Random</button>
          <button type="button" style={{ ...s.variationBtn, color: variationControls.walkEnabled ? '#d4b26f' : '#c6c6c6', opacity: variationControls.canArm ? 1 : 0.55 }} disabled={!variationControls.canArm} onClick={variationControls.onWalkToggle}>Walk</button>
          <button type="button" style={{ ...s.variationBtn, color: variationControls.canVariant ? '#9fd7aa' : '#666', opacity: variationControls.canVariant ? 1 : 0.55 }} disabled={!variationControls.canVariant} onClick={variationControls.onVariant}>Variant</button>
          <button type="button" style={{ ...s.variationBtn, color: variationControls.canUndo ? '#d7b39f' : '#666', opacity: variationControls.canUndo ? 1 : 0.55 }} disabled={!variationControls.canUndo} onClick={variationControls.onUndo}>Undo</button>
          <span style={s.variationStatus}>{variationControls.progressText ?? (variationControls.walkEnabled ? 'Walk mode' : (variationControls.endpointLabel ? `Base ${variationControls.endpointLabel}` : 'Endpoint only'))}</span>
        </div>
      )}
      {controller.selectedValue && (
        <div style={s.presetRow}>
          {selectedOption && controller.canRate(selectedOption, selectedSummary) && (
            <PresetRatingStars value={controller.localRatings[ratingKey] ?? selectedSummary?.rating ?? 0} onChange={rating => { void controller.rateSelected(rating); }} color={color} size="0.6rem" />
          )}
          {selectedSummary && selectedSummary.versionCount > 1 && <span style={s.versionBadge}>v{selectedSummary.currentVersion}</span>}
          <button style={{ ...s.slotBtn, ...s.slotA }} onClick={() => controller.loadToSlot('A')} title={`Load into Slot ${slotALabel}`}>{slotALabel}</button>
          <button style={{ ...s.slotBtn, ...s.slotB }} onClick={() => controller.loadToSlot('B')} title={`Load into Slot ${slotBLabel}`}>{slotBLabel}</button>
          {onOpenPool && <button type="button" style={{ ...s.poolBtn, color, borderColor: `${color}55` }} onClick={onOpenPool} title={poolButtonTitle} aria-label={poolButtonAriaLabel}>{poolButtonLabel}</button>}
          <button style={s.saveBtn} disabled={controller.mutationBusy} onClick={controller.openSaveDialog} title={`Save current state as ${controller.selectedEntryName}`}>
            <svg width="1em" height="1em" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
              <path d="M2.5 2.5h8.25L13.5 5.25v8.25a1 1 0 0 1-1 1h-10a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1Z" />
              <path d="M5 2.5v4h5.5v-4M4.5 14.5v-4h7v4" />
            </svg>
          </button>
          {PRESET_DELETE_ENABLED && (SHARED_PRESET_TEST_MODE || selectedSummary?.library !== 'stock') && <button style={s.deleteBtn} disabled={controller.mutationBusy} onClick={controller.deleteSelected} title={`Delete ${controller.selectedEntryName}`}>✕</button>}
          {selectedSummary && selectedSummary.versionCount > 1 && <button style={{ ...s.expandBtn, ...(controller.showVersions ? { color: '#a5c4d4' } : {}) }} onClick={() => { void controller.toggleVersions(); }} title="Show version history">+</button>}
        </div>
      )}
      {controller.showVersions && controller.versionEntry && controller.lastVersions.map(version => {
        const diffs = controller.getVersionDiffs(controller.versionEntry!, version.v);
        return <React.Fragment key={version.v}>
          <div style={s.versionRow}><span style={{ color: version.v === controller.versionEntry!.currentVersion ? '#a5c4d4' : '#777' }}>v{version.v}</span><span style={{ color: '#555', fontSize: '0.5rem' }}>{new Date(version.timestamp).toLocaleDateString()}</span></div>
          {diffs.fromPrev.length > 0 && <div style={s.diffSummary}>vs prev: {diffs.fromPrev.slice(0, 5).join(', ')}{diffs.fromPrev.length > 5 && ` +${diffs.fromPrev.length - 5}`}</div>}
          {version.v > 1 && diffs.fromV1.length > 0 && <div style={{ ...s.diffSummary, color: '#555' }}>vs v1: {diffs.fromV1.slice(0, 5).join(', ')}{diffs.fromV1.length > 5 && ` +${diffs.fromV1.length - 5}`}</div>}
        </React.Fragment>;
      })}
      {controller.mutationError && <div role="alert" style={s.mutationError}>{controller.mutationError}</div>}
      {controller.saveDialog && (
        <div style={s.overlay} onClick={() => { if (!controller.mutationBusy) controller.setSaveDialog(null); }}>
          <div style={s.dialog} onClick={event => event.stopPropagation()}>
            <div style={s.dialogTitle}>Save Preset</div>
            <div style={{ fontSize: '0.7rem', color: '#888', marginBottom: 4 }}>Current: <strong style={{ color: '#a5c4d4' }}>{controller.saveDialog.originalName}</strong></div>
            <button disabled={controller.mutationBusy} onClick={() => { void controller.saveOverwrite(); }} style={{ ...s.dialogBtn, background: 'rgba(184,224,255,0.14)', borderColor: 'rgba(184,224,255,0.34)', color: '#B8E0FF', width: '100%', marginBottom: 10, padding: '8px 16px' }}>Save &quot;{controller.saveDialog.originalName}&quot;</button>
            <div style={{ fontSize: '0.7rem', color: '#888', marginBottom: 4 }}>New preset name:</div>
            <input type="text" disabled={controller.mutationBusy} value={controller.saveAsName} onChange={event => controller.setSaveAsName(event.target.value)} placeholder="New preset name" style={s.input} maxLength={40} onKeyDown={event => { if (!controller.mutationBusy && event.key === 'Enter' && controller.saveAsName.trim()) void controller.saveAs(); if (!controller.mutationBusy && event.key === 'Escape') controller.setSaveDialog(null); }} />
            <PresetTagEditor value={controller.saveTags} onChange={controller.setSaveTags} suggestions={controller.tagSuggestions} accentColor={accentColor} />
            <div style={s.dialogBtnRow}>
              <button disabled={controller.mutationBusy} onClick={() => controller.setSaveDialog(null)} style={{ ...s.dialogBtn, background: 'rgba(255,255,255,0.05)', color: 'rgba(244,237,228,0.66)' }}>Cancel</button>
              <button onClick={() => { void controller.rename(); }} disabled={controller.mutationBusy || !controller.saveAsName.trim() || controller.saveAsName.trim() === controller.saveDialog.originalName} style={{ ...s.dialogBtn, background: 'rgba(214,178,111,0.14)', color: '#d6b26f' }}>Rename</button>
              <button onClick={() => { void controller.saveAs(); }} disabled={controller.mutationBusy || !controller.saveAsName.trim()} style={{ ...s.dialogBtn, background: 'rgba(159,215,170,0.14)', color: '#9fd7aa' }}>Save As</button>
            </div>
          </div>
        </div>
      )}
      {controller.confirm && (
        <div style={s.overlay} onClick={() => { if (!controller.mutationBusy) controller.setConfirm(null); }}>
          <div style={{ ...s.dialog, textAlign: 'center' }} onClick={event => event.stopPropagation()}>
            <div>{controller.confirm.message}</div>
            <div style={s.dialogBtnRow}><button disabled={controller.mutationBusy} style={{ ...s.dialogBtn, background: 'rgba(196,92,92,0.14)', color: '#d88f8f' }} onClick={() => { void controller.confirm?.onConfirm(); }}>Yes</button><button disabled={controller.mutationBusy} style={{ ...s.dialogBtn, background: 'rgba(255,255,255,0.05)', color: 'rgba(244,237,228,0.66)' }} onClick={() => controller.setConfirm(null)}>Cancel</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
