/**
 * Journey Mode View
 *
 * Wraps DiamondJourneyUI with audio integration and navigation.
 * The journey state is managed at App level so it persists across UI modes.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DiamondJourneyUI } from './DiamondJourneyUI';
import type { UseJourneyResult } from './journeyState';
import type { SavedPreset } from './state';
import type { PresetEntry, PresetSummary } from '../presets/types';
import type { JourneyValidationResult } from '../presets/journeyPresetCodec';
import { normalizeJourneyPresetNameKey, type SaveJourneyPresetOptions } from '../presets/useJourneyPresets';
import { PresetRatingStars } from '../presets/PresetRatingStars';
import { isMobileDevice } from '../platform';
import { JourneyPresetGlyph } from './JourneyPresetGlyph';
import type { BackgroundJourneyUiState } from './useBackgroundJourneyRuntimeSurface';

const TEXT_SYMBOLS = {
  snowflake: '❄\uFE0E',
  sparkle: '☳\uFE0E',
  visualizer: '\u06DE',
} as const;

const PANEL_SYMBOLS = {
  journey: '⟡\uFE0E',
  search: '⌕',
  updated: '◷\uFE0E',
  az: 'A↧',
  load: '↗\uFE0E',
  save: (
    <svg width="1em" height="1em" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M2.5 2.5h8.25L13.5 5.25v8.25a1 1 0 0 1-1 1h-10a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1Z" />
      <path d="M5 2.5v4h5.5v-4M4.5 14.5v-4h7v4" />
    </svg>
  ),
  undo: '↺',
  delete: '×',
  empty: '∅',
} as const;

type PresetSortMode = 'updated' | 'az';

function presetSourceLabel(library: PresetSummary['library'] | undefined): string {
  if (library === 'cloud') return 'Cloud';
  if (library === 'stock') return 'Stock';
  if (library === 'user') return 'Local';
  return 'Preset';
}

function formatPresetDate(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(timestamp));
}

function journeyMatchesQuery(preset: PresetSummary, query: string): boolean {
  if (!query) return true;
  const haystack = [preset.name, preset.familyName, preset.library, preset.description]
    .filter(Boolean).join(' ').toLocaleLowerCase();
  return haystack.includes(query);
}

function journeyPresetHoverTitle(preset: PresetSummary, action: string): string {
  return preset.description
    ? `${action}: ${preset.name}\n${preset.description}`
    : `${action}: ${preset.name}`;
}

export interface JourneyPresetActionOutcome {
  succeeded: boolean;
  error?: string;
}

/** Keep UI state open when a store signals failure without throwing. */
export async function resolveJourneyPresetAction<T>(
  action: () => Promise<T>,
  isSuccess: (result: T) => boolean = () => true,
  failedMessage = 'Journey preset action was not completed.',
): Promise<JourneyPresetActionOutcome> {
  try {
    const result = await action();
    return isSuccess(result)
      ? { succeeded: true }
      : { succeeded: false, error: failedMessage };
  } catch (error) {
    return {
      succeeded: false,
      error: error instanceof Error ? error.message : 'Journey preset action failed.',
    };
  }
}

interface JourneyModeViewProps {
  presets: SavedPreset[];
  journey: UseJourneyResult;
  journeyPresets: PresetSummary[];
  activeJourneyPresetName: string;
  activeJourneyHasBackup: boolean;
  journeyValidation: JourneyValidationResult;
  onLoadJourneyPreset: (name: string) => Promise<void>;
  onSaveJourneyPreset: (
    name: string,
    description?: string,
    intent?: Pick<SaveJourneyPresetOptions, 'overwriteExisting'>,
  ) => Promise<PresetEntry | null>;
  onRenameJourneyPreset: (name: string, nextName: string, description?: string) => Promise<PresetEntry | null>;
  onDeleteJourneyPreset: (name: string) => Promise<boolean>;
  onUndoJourneyPreset: () => Promise<void>;
  onRateJourneyPreset: (name: string, rating: number) => Promise<boolean>;
  onJourneyEnd: () => void;
  onStopAudio: () => void;
  onShowSnowflake: () => void;
  onShowVisualizer: () => void;
  onShowAdvanced: () => void;
  isPlaying: boolean;
  backgroundJourney: {
    state: BackgroundJourneyUiState;
    onPrepare: () => void;
    onOptimize: () => void;
    onConfirmOptimization: () => void;
    onStartPrepared: () => Promise<boolean>;
    onForegroundOnly: () => void;
    onCancel: () => void;
  };
}

export const JourneyModeView: React.FC<JourneyModeViewProps> = ({
  presets,
  journey,
  journeyPresets,
  activeJourneyPresetName,
  activeJourneyHasBackup,
  journeyValidation,
  onLoadJourneyPreset,
  onSaveJourneyPreset,
  onRenameJourneyPreset,
  onDeleteJourneyPreset,
  onUndoJourneyPreset,
  onRateJourneyPreset,
  onJourneyEnd,
  onStopAudio,
  onShowSnowflake,
  onShowVisualizer,
  onShowAdvanced,
  isPlaying: _isPlaying,
  backgroundJourney,
}) => {
  const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [panelOpen, setPanelOpen] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveAsName, setSaveAsName] = useState('');
  const [saveDescription, setSaveDescription] = useState('');
  const [presetSearch, setPresetSearch] = useState('');
  const [presetSort, setPresetSort] = useState<PresetSortMode>('updated');
  const [localRatings, setLocalRatings] = useState<Record<string, number>>({});
  const [presetActionBusy, setPresetActionBusy] = useState(false);
  const [presetActionError, setPresetActionError] = useState('');
  const journeyActiveRef = useRef(false);
  const presetActionInFlightRef = useRef(false);

  useEffect(() => {
    const handleResize = () => {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!journey.config) {
      journey.createEmptyDiamond();
    }
  }, [journey]);

  useEffect(() => {
    const wasActive = journeyActiveRef.current;
    const isActive = journey.state.phase !== 'idle' && journey.state.phase !== 'ended';
    journeyActiveRef.current = isActive;
    if (wasActive && journey.state.phase === 'ended') {
      onJourneyEnd();
    }
  }, [journey.state.phase, onJourneyEnd]);

  const presetQuery = presetSearch.toLocaleLowerCase().trim();

  const sortedJourneyPresets = useMemo(() => {
    let filtered = [...journeyPresets];
    if (presetQuery) {
      filtered = filtered.filter((p) => journeyMatchesQuery(p, presetQuery));
    }
    if (presetSort === 'az') {
      filtered.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      filtered.sort((a, b) => b.updatedAt - a.updatedAt || a.name.localeCompare(b.name));
    }
    return filtered;
  }, [journeyPresets, presetQuery, presetSort]);

  const smallerDimension = Math.min(windowSize.width, windowSize.height - 100);
  const isMobile = windowSize.width < 1024;
  const disablePresetPopupBlur = isMobile || isMobileDevice();
  const canvasSize = isMobile
    ? Math.max(250, Math.min(smallerDimension * 0.875, 650))
    : Math.max(200, Math.min(smallerDimension * 0.7, 550));
  const canvasTop = (windowSize.height - canvasSize) / 2;
  const canvasBottom = canvasTop + canvasSize;
  const bottomGap = windowSize.height - canvasBottom;
  const navBottom = Math.max(10, bottomGap / 2 - 20);
  const panelTop = 'calc(54px + env(safe-area-inset-top))';
  const currentJourneySaveName = activeJourneyPresetName
    || (journey.config?.name && journey.config.name !== 'New Journey' ? journey.config.name : '');
  const journeyStatusPillVisible =
    journey.state.phase === 'playing' ||
    journey.state.phase === 'morphing' ||
    journey.state.phase === 'self-loop' ||
    journey.state.phase === 'ending';

  useEffect(() => {
    if (journeyStatusPillVisible) {
      setPanelOpen(false);
    }
  }, [journeyStatusPillVisible]);

  const handleStop = useCallback(() => {
    journey.stop();
    onStopAudio();
  }, [journey, onStopAudio]);

  const handleSave = useCallback(() => {
    const currentKey = normalizeJourneyPresetNameKey(currentJourneySaveName);
    const currentSummary = journeyPresets.find((preset) => normalizeJourneyPresetNameKey(preset.name) === currentKey);
    setSaveAsName('');
    setSaveDescription(currentSummary?.description ?? '');
    setPresetActionError('');
    setSaveDialogOpen(true);
  }, [currentJourneySaveName, journeyPresets]);

  const runPresetAction = useCallback(async <T,>(
    action: () => Promise<T>,
    isSuccess: (result: T) => boolean = () => true,
    failedMessage?: string,
  ): Promise<boolean> => {
    if (presetActionInFlightRef.current) return false;
    presetActionInFlightRef.current = true;
    setPresetActionBusy(true);
    setPresetActionError('');
    try {
      const outcome = await resolveJourneyPresetAction(action, isSuccess, failedMessage);
      if (!outcome.succeeded) setPresetActionError(outcome.error ?? 'Journey preset action was not completed.');
      return outcome.succeeded;
    } finally {
      presetActionInFlightRef.current = false;
      setPresetActionBusy(false);
    }
  }, []);

  const handleSaveCurrent = useCallback(async () => {
    if (!currentJourneySaveName) return;
    if (await runPresetAction(
      () => onSaveJourneyPreset(currentJourneySaveName, saveDescription),
      (entry) => entry !== null,
      'Journey preset was not saved.',
    )) {
      setSaveDialogOpen(false);
    }
  }, [currentJourneySaveName, onSaveJourneyPreset, runPresetAction, saveDescription]);

  const handleSaveAs = useCallback(async () => {
    const targetName = saveAsName.trim();
    if (!targetName) return;
    const targetKey = normalizeJourneyPresetNameKey(targetName);
    const currentKey = normalizeJourneyPresetNameKey(currentJourneySaveName);
    const existing = journeyPresets.find((preset) => normalizeJourneyPresetNameKey(preset.name) === targetKey);
    const overwriteExisting = Boolean(existing && targetKey !== currentKey);
    if (overwriteExisting && !window.confirm(
      `A Journey named "${existing!.name}" already exists. Replace it with this Journey?`,
    )) {
      return;
    }
    if (await runPresetAction(
      () => onSaveJourneyPreset(
        targetName,
        saveDescription,
        overwriteExisting ? { overwriteExisting: true } : undefined,
      ),
      (entry) => entry !== null,
      'Journey preset was not saved.',
    )) {
      setSaveDialogOpen(false);
    }
  }, [currentJourneySaveName, journeyPresets, onSaveJourneyPreset, runPresetAction, saveAsName, saveDescription]);

  const handleRename = useCallback(async () => {
    if (!currentJourneySaveName) return;
    const targetName = saveAsName.trim();
    if (!targetName || targetName === currentJourneySaveName) return;
    if (await runPresetAction(
      () => onRenameJourneyPreset(currentJourneySaveName, targetName, saveDescription),
      (entry) => entry !== null,
      'Journey preset was not renamed.',
    )) {
      setSaveDialogOpen(false);
    }
  }, [currentJourneySaveName, onRenameJourneyPreset, runPresetAction, saveAsName, saveDescription]);

  const handleUndoPreset = useCallback(async () => {
    await runPresetAction(onUndoJourneyPreset);
  }, [onUndoJourneyPreset, runPresetAction]);

  const handleDeletePreset = useCallback(async (name: string) => {
    if (!window.confirm(`Delete journey "${name}"?`)) return;
    await runPresetAction(
      () => onDeleteJourneyPreset(name),
      (deleted) => deleted,
      'Journey preset was not deleted.',
    );
  }, [onDeleteJourneyPreset, runPresetAction]);

  const handleRating = useCallback(async (name: string, rating: number) => {
    const previousRating = localRatings[name]
      ?? journeyPresets.find((preset) => preset.name === name)?.rating
      ?? 0;
    setLocalRatings((prev) => ({ ...prev, [name]: rating }));
    const saved = await runPresetAction(
      () => onRateJourneyPreset(name, rating),
      (updated) => updated,
      'Journey rating was not saved.',
    );
    if (saved) return;
    setLocalRatings((prev) => {
      const next = { ...prev };
      if (previousRating > 0) next[name] = previousRating;
      else delete next[name];
      return next;
    });
  }, [journeyPresets, localRatings, onRateJourneyPreset, runPresetAction]);

  const backgroundStatus = useMemo(() => {
    const state = backgroundJourney.state;
    const MiB = 1024 * 1024;
    if (state.status === 'ready') {
      const minutes = Math.floor(state.durationSeconds / 60);
      const hours = Math.floor(minutes / 60);
      return `Background ready · ${hours}h ${minutes % 60}m · ${Math.round(state.assetBytes / MiB)} / 160 MiB`;
    }
    if (state.status === 'planning') return 'Planning background route';
    if (state.status === 'preparing') return `Preparing audio · ${state.uploadedEvents} of ${state.totalEvents}`;
    if (state.status === 'optimizable') return `Background route available · ${state.sceneCount} of ${state.totalSceneCount} scenes · ${Math.round(state.assetBytes / MiB)} / 160 MiB`;
    if (state.status === 'stale') return 'Journey changed · prepare again';
    if (state.status === 'unavailable') {
      if (state.reason === 'asset-soft-budget') return `Background unavailable · ${Math.round((state.assetBytes ?? 0) / MiB)} / 160 MiB`;
      return `Background unavailable · ${state.reason.split('-').join(' ')}`;
    }
    return 'Background not prepared';
  }, [backgroundJourney.state]);

  return (
    <div style={styles.container}>
      {/* Main Journey UI */}
      <div style={styles.journeyShell}>
        <div style={styles.backgroundReadiness}>
          <span>{backgroundStatus}</span>
          <span style={styles.backgroundActions}>
            {(backgroundJourney.state.status === 'idle' || backgroundJourney.state.status === 'stale' || backgroundJourney.state.status === 'unavailable') && (
              <button type="button" style={styles.backgroundButton} onClick={backgroundJourney.onPrepare}>Prepare</button>
            )}
            {backgroundJourney.state.status === 'unavailable' && (
              <button type="button" style={styles.backgroundButton} onClick={backgroundJourney.onForegroundOnly}>Foreground only</button>
            )}
            {backgroundJourney.state.status === 'unavailable' && backgroundJourney.state.reason === 'asset-soft-budget' && (
              <button type="button" style={styles.backgroundButton} onClick={backgroundJourney.onOptimize}>Optimize</button>
            )}
            {backgroundJourney.state.status === 'optimizable' && (
              <button type="button" style={styles.backgroundButton} onClick={backgroundJourney.onConfirmOptimization}>Use reduced route</button>
            )}
            {backgroundJourney.state.status === 'optimizable' && (
              <button type="button" style={styles.backgroundButton} onClick={backgroundJourney.onForegroundOnly}>Foreground only</button>
            )}
            {(backgroundJourney.state.status === 'planning' || backgroundJourney.state.status === 'preparing') && (
              <button type="button" style={styles.backgroundButton} onClick={backgroundJourney.onCancel}>Cancel</button>
            )}
          </span>
        </div>
        <DiamondJourneyUI
          config={journey.config}
          state={journey.state}
          presets={presets}
          onConfigChange={journey.setConfig}
          onPlay={() => {
            if (!journeyValidation.playable) {
              alert(`Journey cannot play yet:\n\n${journeyValidation.issues.join('\n')}`);
              return;
            }
            if (backgroundJourney.state.status === 'ready') {
              void backgroundJourney.onStartPrepared();
            } else {
              backgroundJourney.onForegroundOnly();
            }
          }}
          onStop={handleStop}
        />
      </div>

      {!journeyStatusPillVisible && (
        <>
          {/* Trigger chip — top center */}
          <button
            type="button"
            onClick={() => setPanelOpen(!panelOpen)}
            style={{
              ...styles.triggerChip,
              borderColor: panelOpen ? 'rgba(184,224,255,0.38)' : 'rgba(255,255,255,0.13)',
              color: panelOpen ? '#B8E0FF' : '#f4ede4',
            }}
          >
            <span style={{ fontSize: '1.06rem', lineHeight: 1 }}>{PANEL_SYMBOLS.journey}</span>
            <span style={{ fontSize: 12, fontWeight: 700 }}>
              {activeJourneyPresetName || 'Journey'}
            </span>
          </button>

          {/* Preset Panel */}
          {panelOpen && (
            <button
              type="button"
              aria-label="Close journey preset panel"
              style={styles.panelBackdrop}
              onClick={() => setPanelOpen(false)}
            />
          )}
          {panelOpen && (
            <div
              style={{
                ...styles.panel,
                top: panelTop,
                ...(disablePresetPopupBlur
                  ? {
                    background: 'rgba(22,21,19,0.96)',
                    backdropFilter: 'none',
                    WebkitBackdropFilter: 'none',
                  }
                  : null),
              }}
            >
              {/* Header */}
              <div style={styles.panelHeader}>
                <div style={styles.panelTitle}>Journey Presets</div>

                {/* Search + Sort + Actions */}
                <div style={styles.panelControlRow}>
                  <label style={styles.searchLabel}>
                    <span style={{ fontSize: '1.02rem' }}>{PANEL_SYMBOLS.search}</span>
                    <input
                      value={presetSearch}
                      onChange={(e) => setPresetSearch(e.target.value)}
                      placeholder="Search"
                      style={styles.searchInput}
                    />
                    {presetSearch && (
                      <button type="button" title="Clear" onClick={() => setPresetSearch('')} style={styles.clearButton}>×</button>
                    )}
                  </label>
                  <button type="button" style={styles.actionButton} title="Save journey" aria-label="Save journey" onClick={handleSave}>
                    <span style={styles.saveActionIcon}>{PANEL_SYMBOLS.save}</span>
                  </button>
                  <button
                    type="button"
                    style={{ ...styles.actionButton, ...styles.undoActionButton, opacity: (!activeJourneyPresetName || !activeJourneyHasBackup) ? 0.4 : 1 }}
                    disabled={presetActionBusy || !activeJourneyPresetName || !activeJourneyHasBackup}
                    title="Undo last save"
                    aria-label="Undo last save"
                    onClick={() => { void handleUndoPreset(); }}
                  >
                    {PANEL_SYMBOLS.undo}
                  </button>
                  <div style={styles.sortBar}>
                    {([
                      ['updated', PANEL_SYMBOLS.updated, 'Sort by updated'],
                      ['az', PANEL_SYMBOLS.az, 'Sort alphabetically'],
                    ] as const).map(([sort, symbol, title]) => (
                      <button
                        key={sort}
                        type="button"
                        title={title}
                        onClick={() => setPresetSort(sort)}
                        style={{
                          ...styles.sortButton,
                          background: presetSort === sort ? 'rgba(184,224,255,0.18)' : 'transparent',
                          color: presetSort === sort ? '#B8E0FF' : 'rgba(244,237,228,0.55)',
                      }}
                    >
                        <span style={sort === 'updated' ? styles.timeSortIcon : undefined}>
                          {symbol}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Preset list */}
              <div style={styles.panelList}>
                {sortedJourneyPresets.length === 0 && (
                  <div style={styles.emptyState}>{PANEL_SYMBOLS.empty}</div>
                )}
                {sortedJourneyPresets.map((preset) => (
                  <div
                    key={`${preset.library}:${preset.name}`}
                    style={{
                      ...styles.presetRow,
                      borderColor: preset.name === activeJourneyPresetName
                        ? 'rgba(184,224,255,0.32)'
                        : 'rgba(255,255,255,0.10)',
                    }}
                  >
                    <button
                      type="button"
                      title={journeyPresetHoverTitle(preset, 'Load journey')}
                      onClick={() => {
                        void onLoadJourneyPreset(preset.name);
                        setPanelOpen(false);
                      }}
                      style={styles.presetRowButton}
                    >
                      <span style={styles.presetIcon}>
                        <JourneyPresetGlyph preview={preset.journeyPreview} color="#B8E0FF" mutedColor="rgba(184,224,255,0.36)" />
                      </span>
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span style={styles.presetName}>{preset.name}</span>
                        <span style={styles.presetMeta}>
                          <span>{presetSourceLabel(preset.library)}</span>
                          {preset.versionCount > 1 && <span>v{preset.versionCount}</span>}
                          {preset.updatedAt > 0 && <span>{formatPresetDate(preset.updatedAt)}</span>}
                        </span>
                      </span>
                    </button>
                    <div style={styles.presetRowActions}>
                      <PresetRatingStars
                        value={localRatings[preset.name] ?? preset.rating ?? 0}
                        onChange={(r) => {
                          if (!presetActionBusy) void handleRating(preset.name, r);
                        }}
                        color="#B8E0FF"
                        emptyColor="#2a3a4a"
                        size="0.62rem"
                      />
                      <button
                        type="button"
                        title={journeyPresetHoverTitle(preset, 'Load journey')}
                        onClick={() => {
                          void onLoadJourneyPreset(preset.name);
                          setPanelOpen(false);
                        }}
                        style={styles.loadButton}
                      >
                        {PANEL_SYMBOLS.load}
                      </button>
                      <button
                        type="button"
                        title="Delete journey"
                        onClick={() => {
                          void handleDeletePreset(preset.name);
                        }}
                        disabled={presetActionBusy}
                        style={styles.deleteButton}
                      >
                        {PANEL_SYMBOLS.delete}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Validation warning */}
              {!journeyValidation.playable && (
                <div style={styles.validationWarning} title={journeyValidation.issues.join('\n')}>
                  {journeyValidation.issues[0]}
                </div>
              )}
              {presetActionError && (
                <div role="alert" style={styles.presetActionError}>
                  {presetActionError}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Bottom navigation */}
      <div style={{ ...styles.bottomNav, bottom: navBottom }}>
        <button type="button" style={{ ...styles.navButton, ...styles.visualizerNavButton }} onClick={onShowVisualizer} title="Visualizer Mode" aria-label="Visualizer Mode">
          {TEXT_SYMBOLS.visualizer}
        </button>
        <button type="button" style={styles.navButton} onClick={onShowSnowflake} title="Snowflake" aria-label="Snowflake">
          <span style={styles.snowflakeNavIcon}>{TEXT_SYMBOLS.snowflake}</span>
        </button>
        <button type="button" style={styles.navButton} onClick={onShowAdvanced} title="Advanced Mode" aria-label="Advanced Mode">
          {TEXT_SYMBOLS.sparkle}
        </button>
      </div>

      {/* Save dialog — change name to save-as */}
      {saveDialogOpen && (
        <div style={styles.dialogOverlay} onClick={() => setSaveDialogOpen(false)}>
          <div style={styles.dialogPanel} onClick={(e) => e.stopPropagation()}>
            <div style={styles.dialogTitle}>Save Journey</div>
            {presetActionError && (
              <div role="alert" style={styles.presetActionError}>
                {presetActionError}
              </div>
            )}
            {currentJourneySaveName && (
              <div style={styles.dialogCurrentLabel}>
                Current: <strong style={{ color: '#B8E0FF' }}>{currentJourneySaveName}</strong>
              </div>
            )}
            <div style={styles.dialogSectionLabel}>Description:</div>
            <textarea
              value={saveDescription}
              onChange={(e) => setSaveDescription(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setSaveDialogOpen(false);
              }}
              placeholder="Journey description"
              maxLength={280}
              style={styles.dialogTextarea}
            />
            {currentJourneySaveName && (
              <button
                type="button"
                onClick={() => { void handleSaveCurrent(); }}
                disabled={presetActionBusy}
                style={styles.dialogSaveCurrentButton}
              >
                Save "{currentJourneySaveName}"
              </button>
            )}
            <div style={styles.dialogSectionLabel}>New journey name:</div>
            <input
              value={saveAsName}
              onChange={(e) => setSaveAsName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setSaveDialogOpen(false);
                if (e.key === 'Enter' && saveAsName.trim()) {
                  void handleSaveAs();
                }
              }}
              placeholder="New journey name"
              autoFocus
              maxLength={80}
              style={styles.dialogInput}
            />
            {activeJourneyPresetName && saveAsName.trim() && saveAsName.trim() !== activeJourneyPresetName && (
              <div style={styles.saveAsHint}>
                Original "{activeJourneyPresetName}" stays unchanged.
              </div>
            )}
            <div style={styles.dialogActions}>
              <button type="button" style={styles.dialogButton} onClick={() => setSaveDialogOpen(false)}>Cancel</button>
              {currentJourneySaveName && (
                <button
                  type="button"
                  style={{
                    ...styles.dialogButton,
                    background: saveAsName.trim() && saveAsName.trim() !== currentJourneySaveName
                      ? 'rgba(214,178,111,0.14)'
                      : 'rgba(255,255,255,0.06)',
                    borderColor: saveAsName.trim() && saveAsName.trim() !== currentJourneySaveName
                      ? 'rgba(214,178,111,0.34)'
                      : 'rgba(255,255,255,0.10)',
                    color: saveAsName.trim() && saveAsName.trim() !== currentJourneySaveName
                      ? '#d6b26f'
                      : 'rgba(244,237,228,0.42)',
                  }}
                disabled={presetActionBusy || !saveAsName.trim() || saveAsName.trim() === currentJourneySaveName}
                  onClick={() => {
                    void handleRename();
                  }}
                  title="Rename without changing the journey preset ID"
                >
                  Rename
                </button>
              )}
              <button
                type="button"
                style={{
                  ...styles.dialogButton,
                  ...styles.dialogSaveAsButton,
                  opacity: saveAsName.trim() ? 1 : 0.45,
                }}
                disabled={presetActionBusy || !saveAsName.trim()}
                onClick={() => {
                  void handleSaveAs();
                }}
              >
                {presetActionBusy ? 'Saving…' : 'Save As'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    width: '100%',
    minHeight: '100dvh',
    height: '100dvh',
    background: 'linear-gradient(180deg, #100f0e 0%, #171615 40%, #1c1b19 100%)',
    backgroundAttachment: 'fixed',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    color: '#f4ede4',
  },
  journeyShell: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  backgroundReadiness: {
    position: 'fixed',
    top: 'calc(54px + env(safe-area-inset-top))',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 52,
    width: 'min(92vw, 520px)',
    minHeight: 34,
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    padding: '6px 8px 6px 10px',
    border: '1px solid rgba(184,224,255,0.18)',
    borderRadius: 6,
    background: 'rgba(16,15,14,0.9)',
    color: 'rgba(244,237,228,0.74)',
    fontSize: 11,
  },
  backgroundActions: {
    display: 'flex',
    gap: 6,
    flexShrink: 0,
  },
  backgroundButton: {
    minHeight: 26,
    padding: '0 9px',
    border: '1px solid rgba(184,224,255,0.24)',
    borderRadius: 5,
    background: 'rgba(184,224,255,0.08)',
    color: '#B8E0FF',
    cursor: 'pointer',
    font: 'inherit',
    fontWeight: 700,
  },
  triggerChip: {
    position: 'fixed',
    top: 'calc(12px + env(safe-area-inset-top))',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '7px 14px',
    borderRadius: 20,
    background: 'rgba(16, 15, 14, 0.82)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    border: '1px solid rgba(255, 255, 255, 0.13)',
    boxShadow: '0 8px 24px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.06)',
    cursor: 'pointer',
    zIndex: 70,
  },
  panelBackdrop: {
    position: 'fixed',
    inset: 0,
    border: 'none',
    padding: 0,
    background: 'transparent',
    cursor: 'default',
    zIndex: 55,
  },
  panel: {
    position: 'fixed',
    left: '50%',
    transform: 'translateX(-50%)',
    width: 'min(92vw, 420px)',
    maxHeight: 'min(77vh, 660px)',
    overflow: 'hidden',
    background: 'rgba(22,21,19,0.92)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    borderRadius: 12,
    padding: 0,
    boxShadow: '0 18px 54px rgba(0,0,0,0.48), inset 0 1px 0 rgba(184,224,255,0.08)',
    border: '1px solid rgba(184,224,255,0.28)',
    zIndex: 60,
  },
  panelHeader: {
    padding: '14px 14px 12px',
    borderBottom: '1px solid rgba(184,224,255,0.13)',
    display: 'grid',
    gap: 10,
  },
  panelTitle: {
    color: '#B8E0FF',
    fontSize: 12,
    fontWeight: 800,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.12em',
  },
  panelControlRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto auto auto',
    alignItems: 'center',
    gap: 8,
  },
  searchLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    height: 36,
    padding: '0 10px',
    borderRadius: 8,
    background: 'rgba(0,0,0,0.18)',
    border: '1px solid rgba(184,224,255,0.16)',
    color: 'rgba(184,224,255,0.48)',
  },
  searchInput: {
    width: '100%',
    minWidth: 0,
    border: 'none',
    outline: 'none',
    background: 'transparent',
    color: '#f4ede4',
    fontSize: '0.84rem',
    fontFamily: 'inherit',
  },
  clearButton: {
    width: 24,
    height: 24,
    borderRadius: 5,
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(255,255,255,0.05)',
    color: 'rgba(184,224,255,0.72)',
    cursor: 'pointer',
    lineHeight: 1,
  },
  sortBar: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 32px)',
    gap: 4,
    padding: 2,
    borderRadius: 8,
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(184,224,255,0.14)',
  },
  sortButton: {
    width: 32,
    height: 32,
    borderRadius: 6,
    border: '1px solid transparent',
    cursor: 'pointer',
    fontSize: '0.68rem',
    fontWeight: 760,
    lineHeight: 1,
  },
  actionBar: {
    display: 'flex',
    gap: 6,
  },
  actionButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    padding: 0,
    borderRadius: 6,
    border: '1px solid rgba(184,224,255,0.14)',
    background: 'rgba(184,224,255,0.06)',
    color: '#B8E0FF',
    cursor: 'pointer',
    fontSize: '0.82rem',
    fontWeight: 700,
    lineHeight: 1,
  },
  saveActionIcon: {
    display: 'block',
    fontSize: '0.72rem',
    lineHeight: 1,
  },
  undoActionButton: {
    fontSize: '1.04rem',
  },
  timeSortIcon: {
    display: 'block',
    fontSize: '0.92rem',
    lineHeight: 1,
  },
  panelList: {
    maxHeight: 'calc(min(77vh, 660px) - 180px)',
    overflowY: 'auto' as const,
    padding: 8,
  },
  emptyState: {
    height: 104,
    display: 'grid',
    placeItems: 'center',
    color: 'rgba(184,224,255,0.48)',
    border: '1px dashed rgba(184,224,255,0.18)',
    borderRadius: 8,
    fontSize: '0.82rem',
  },
  presetRow: {
    marginBottom: 8,
    borderRadius: 8,
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    alignItems: 'center',
    gap: 8,
    padding: '8px 9px 8px 10px',
    background: 'rgba(184,224,255,0.065)',
    border: '1px solid rgba(255,255,255,0.10)',
  },
  presetRowButton: {
    width: '100%',
    minWidth: 0,
    minHeight: 42,
    display: 'grid',
    gridTemplateColumns: '30px minmax(0, 1fr)',
    gap: 10,
    alignItems: 'center',
    padding: 0,
    border: 'none',
    background: 'transparent',
    color: '#f4ede4',
    cursor: 'pointer',
    textAlign: 'left' as const,
    fontFamily: 'inherit',
  },
  presetIcon: {
    width: 30,
    height: 30,
    borderRadius: 7,
    display: 'grid',
    placeItems: 'center',
    background: 'rgba(184,224,255,0.12)',
    color: '#B8E0FF',
    fontSize: '1.08rem',
  },
  presetName: {
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    fontSize: '0.9rem',
    fontWeight: 760,
  },
  presetMeta: {
    display: 'flex',
    gap: 8,
    marginTop: 4,
    color: 'rgba(184,224,255,0.50)',
    fontSize: '0.68rem',
    overflow: 'hidden',
    whiteSpace: 'nowrap' as const,
  },
  presetRowActions: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
  },
  loadButton: {
    width: 26,
    height: 26,
    borderRadius: 6,
    border: '1px solid rgba(159,194,143,0.24)',
    background: 'rgba(159,194,143,0.10)',
    color: '#9fc28f',
    cursor: 'pointer',
    fontSize: '0.82rem',
    fontWeight: 700,
    lineHeight: 1,
  },
  deleteButton: {
    width: 26,
    height: 26,
    borderRadius: 6,
    border: '1px solid rgba(237,90,36,0.2)',
    background: 'rgba(237,90,36,0.08)',
    color: '#ED5A24',
    cursor: 'pointer',
    fontSize: '0.82rem',
    fontWeight: 700,
    lineHeight: 1,
  },
  validationWarning: {
    padding: '8px 14px',
    borderTop: '1px solid rgba(216,179,106,0.16)',
    color: '#d3b182',
    fontSize: '0.72rem',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  presetActionError: {
    padding: '7px 12px',
    color: '#e59a9a',
    fontSize: '0.7rem',
  },
  bottomNav: {
    position: 'fixed',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
    zIndex: 40,
  },
  navButton: {
    width: 42,
    height: 42,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    borderRadius: 0,
    background: 'transparent',
    color: 'rgba(244, 237, 228, 0.82)',
    fontSize: 20,
    cursor: 'pointer',
    textShadow: '0 2px 8px rgba(0,0,0,0.5)',
  },
  visualizerNavButton: {
    fontSize: '0.92rem',
    lineHeight: 1,
  },
  snowflakeNavIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '1em',
    height: '1em',
    fontSize: 23,
    lineHeight: 1,
    transform: 'translateY(1px)',
  },
  dialogOverlay: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingTop: 'calc(64px + env(safe-area-inset-top))',
    boxSizing: 'border-box' as const,
    background: 'rgba(0, 0, 0, 0.5)',
    zIndex: 100,
  },
  dialogPanel: {
    width: 'min(360px, calc(100vw - 32px))',
    padding: 16,
    border: '1px solid rgba(184,224,255,0.18)',
    borderRadius: 8,
    background: 'rgba(22, 21, 20, 0.96)',
    boxShadow: '0 24px 80px rgba(0, 0, 0, 0.45)',
  },
  dialogTitle: {
    marginBottom: 12,
    fontSize: 14,
    fontWeight: 700,
    color: '#B8E0FF',
  },
  dialogCurrentLabel: {
    marginBottom: 6,
    color: 'rgba(244,237,228,0.62)',
    fontSize: '0.72rem',
  },
  dialogSaveCurrentButton: {
    width: '100%',
    minHeight: 36,
    marginBottom: 12,
    padding: '0 12px',
    borderRadius: 7,
    border: '1px solid rgba(184,224,255,0.32)',
    background: 'rgba(184,224,255,0.14)',
    color: '#B8E0FF',
    cursor: 'pointer',
    fontWeight: 760,
    fontFamily: 'inherit',
  },
  dialogSectionLabel: {
    marginBottom: 5,
    color: 'rgba(244,237,228,0.58)',
    fontSize: '0.72rem',
  },
  dialogInput: {
    width: '100%',
    height: 36,
    boxSizing: 'border-box' as const,
    padding: '0 10px',
    border: '1px solid rgba(184,224,255,0.18)',
    borderRadius: 6,
    background: 'rgba(255, 255, 255, 0.06)',
    color: '#f4ede4',
    outline: 'none',
  },
  dialogTextarea: {
    width: '100%',
    minHeight: 72,
    resize: 'vertical' as const,
    boxSizing: 'border-box' as const,
    marginBottom: 12,
    padding: '9px 10px',
    border: '1px solid rgba(184,224,255,0.18)',
    borderRadius: 6,
    background: 'rgba(255, 255, 255, 0.06)',
    color: '#f4ede4',
    outline: 'none',
    fontFamily: 'inherit',
    fontSize: '0.82rem',
    lineHeight: 1.35,
  },
  saveAsHint: {
    marginTop: 6,
    color: 'rgba(184,224,255,0.50)',
    fontSize: '0.72rem',
    fontStyle: 'italic' as const,
  },
  dialogActions: {
    marginTop: 14,
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
  },
  dialogButton: {
    height: 34,
    padding: '0 12px',
    border: '1px solid rgba(255, 255, 255, 0.14)',
    borderRadius: 6,
    background: 'rgba(255, 255, 255, 0.05)',
    color: 'rgba(244,237,228,0.66)',
    cursor: 'pointer',
    fontWeight: 700,
  },
  dialogSaveAsButton: {
    background: 'rgba(159,215,170,0.14)',
    borderColor: 'rgba(159,215,170,0.32)',
    color: '#9fd7aa',
  },
};

export default JourneyModeView;
