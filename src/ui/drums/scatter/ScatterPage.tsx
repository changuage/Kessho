import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { DrumVoiceType } from '../../../audio/drumSynth';
import { DRUM_VOICE_ORDER, DRUM_VOICES } from '../../../audio/drumVoiceConfig';
import type { SliderState } from '../../state';
import type { EngineScatterState, GeneratedDrumPhrase, SeqScatterState } from './scatterTypes';
import { generateScatterPhrase } from './scatterPhraseGenerator';
import type { PhrasePrintMode } from './scatterPhrasePrinter';
import { pushRecentPhrase } from './scatterDefaults';
import { resolveTriggerClip } from '../../sequencer/triggerClip';
import FeelField2D from './FeelField2D';
import { useScatterPhrasePlayer, type ScatterPreviewTriggerOptions, type ScatterStepVisualEvent } from './useScatterPhrasePlayer';
import './scatter.css';

interface ScatterPageProps {
  state: SeqScatterState;
  sliderState: SliderState;
  laneCount: number;
  laneNames: string[];
  laneColors: string[];
  getBpm: () => number;
  runtimeActivePulses?: Record<string, number>;
  onStateChange: (state: SeqScatterState) => void;
  onPrintPhrase: (phrase: GeneratedDrumPhrase, laneIndex: number, mode: PhrasePrintMode) => void;
  onPreviewEngine?: (voice: DrumVoiceType) => void;
  onPreviewEngineWithState?: (voice: DrumVoiceType, options: ScatterPreviewTriggerOptions) => void;
}

function nextSeed(): number {
  return Math.floor(Date.now() % 2147483647);
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function percentFromUnit(value: number): number {
  return Math.round(clampUnit(value) * 100);
}

function quantizeUnit(value: number): number {
  return Math.round(clampUnit(value) * 100) / 100;
}

function verticalPointerToUnit(clientY: number, rect: DOMRect): number {
  const trackPadPx = 6;
  const innerHeight = Math.max(1, rect.height - trackPadPx * 2);
  return clampUnit(1 - ((clientY - rect.top - trackPadPx) / innerHeight));
}

function verticalTouchGestureIntent(
  startX: number,
  startY: number,
  clientX: number,
  clientY: number,
): 'pending' | 'drag' | 'release' {
  const moveTolerancePx = 8;
  const dragIntentPx = 10;
  const dx = Math.abs(clientX - startX);
  const dy = Math.abs(clientY - startY);
  if (dy < dragIntentPx && dx < moveTolerancePx) return 'pending';
  if (dy >= dragIntentPx && dy >= dx) return 'drag';
  if (dx >= moveTolerancePx && dx > dy) return 'release';
  return 'pending';
}

function derivedWalkFromChances(triggerProbability: number, burstProbability: number): number {
  return quantizeUnit((clampUnit(triggerProbability) + clampUnit(burstProbability)) / 2);
}

interface ScatterVerticalChanceSliderProps {
  label: string;
  side: 'left' | 'right';
  value: number;
  walkEnabled: boolean;
  onChange: (value: number) => void;
  onCycleMode: () => void;
}

const ScatterVerticalChanceSlider: React.FC<ScatterVerticalChanceSliderProps> = ({
  label,
  side,
  value,
  walkEnabled,
  onChange,
  onCycleMode,
}) => {
  const [dragging, setDragging] = useState(false);
  const longPressTimerRef = React.useRef<number | null>(null);
  const pendingTouchRef = React.useRef<{
    pointerId: number;
    startX: number;
    startY: number;
  } | null>(null);
  const draggingPointerRef = React.useRef<number | null>(null);
  const dragStartYRef = React.useRef<number | null>(null);
  const longPressConsumedRef = React.useRef(false);
  const clickGuardRef = React.useRef<number>(0);
  const amount = clampUnit(value);
  const percent = percentFromUnit(value);
  const displayLabel = label === 'Trigger' ? 'Trig' : label;

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const resetInteraction = useCallback(() => {
    clearLongPress();
    pendingTouchRef.current = null;
    draggingPointerRef.current = null;
    dragStartYRef.current = null;
    longPressConsumedRef.current = false;
    setDragging(false);
    if (typeof document !== 'undefined') {
      document.documentElement.classList.remove('sl-slider-touch-lock');
    }
  }, [clearLongPress]);

  useEffect(() => () => {
    clearLongPress();
    pendingTouchRef.current = null;
    draggingPointerRef.current = null;
    dragStartYRef.current = null;
    if (typeof document !== 'undefined') {
      document.documentElement.classList.remove('sl-slider-touch-lock');
    }
  }, [clearLongPress]);

  const applyPointerValue = useCallback((target: HTMLElement, clientY: number) => {
    onChange(quantizeUnit(verticalPointerToUnit(clientY, target.getBoundingClientRect())));
  }, [onChange]);

  const scheduleLongPress = useCallback((pointerId: number, startX: number, startY: number) => {
    clearLongPress();
    longPressConsumedRef.current = false;
    if (typeof document !== 'undefined') {
      document.documentElement.classList.add('sl-slider-touch-lock');
    }
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      pendingTouchRef.current = null;
      draggingPointerRef.current = null;
      longPressConsumedRef.current = true;
      setDragging(false);
      onCycleMode();
      if (navigator.vibrate) navigator.vibrate(50);
    }, 400);
    pendingTouchRef.current = {
      pointerId,
      startX,
      startY,
    };
  }, [clearLongPress, onCycleMode]);

  return (
    <button
      type="button"
      className={`scatter-v-mode-slider ${side} ${walkEnabled ? 'walk' : 'single'}${dragging ? ' dragging' : ''}`}
      title={`${label}: ${percent}%`}
      aria-label={`${label} ${percent}%`}
      onDoubleClick={onCycleMode}
      onPointerDown={(event) => {
        const now = Date.now();
        const isPotentialDoubleClick = now - clickGuardRef.current < 400;
        clickGuardRef.current = now;
        if (isPotentialDoubleClick) return;

        clearLongPress();
        pendingTouchRef.current = null;

        if (event.pointerType === 'touch') {
          event.currentTarget.setPointerCapture(event.pointerId);
          scheduleLongPress(event.pointerId, event.clientX, event.clientY);
          return;
        }

        draggingPointerRef.current = event.pointerId;
        dragStartYRef.current = event.clientY;
        setDragging(true);
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const pendingTouch = pendingTouchRef.current;
        if (pendingTouch?.pointerId === event.pointerId) {
          if (
            Math.abs(event.clientX - pendingTouch.startX) > 8 ||
            Math.abs(event.clientY - pendingTouch.startY) > 8
          ) {
            clearLongPress();
          }
          if (longPressConsumedRef.current) return;

          const intent = verticalTouchGestureIntent(
            pendingTouch.startX,
            pendingTouch.startY,
            event.clientX,
            event.clientY,
          );
          if (intent === 'pending') return;
          pendingTouchRef.current = null;

          if (intent === 'release') {
            resetInteraction();
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
            return;
          }

          event.preventDefault();
          draggingPointerRef.current = event.pointerId;
          dragStartYRef.current = event.clientY;
          setDragging(true);
          applyPointerValue(event.currentTarget, event.clientY);
          return;
        }

        if (draggingPointerRef.current !== event.pointerId) return;
        if (event.pointerType === 'touch') event.preventDefault();
        if (event.pointerType !== 'touch' && dragStartYRef.current !== null && Math.abs(event.clientY - dragStartYRef.current) < 1) return;
        applyPointerValue(event.currentTarget, event.clientY);
      }}
      onPointerUp={(event) => {
        const pendingTouch = pendingTouchRef.current;
        if (pendingTouch?.pointerId === event.pointerId && !longPressConsumedRef.current) {
          applyPointerValue(event.currentTarget, event.clientY);
        }
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        resetInteraction();
      }}
      onPointerCancel={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        resetInteraction();
      }}
    >
      <span className="scatter-v-mode-slider__label">{displayLabel}</span>
      <span className="scatter-v-mode-slider__cell" aria-hidden="true">
        <span className="scatter-v-mode-slider__track" />
        <span
          className="scatter-v-mode-slider__fill"
          style={{ height: `${amount * 100}%`, opacity: 0.16 + amount * 0.72 }}
        />
        <span
          className="scatter-v-mode-slider__indicator"
          style={{ bottom: `${amount * 100}%` }}
        />
      </span>
      <span className="scatter-v-mode-slider__readout">
        {walkEnabled && <span className="scatter-v-mode-slider__mode">↝</span>}
        <span>{percent}%</span>
      </span>
    </button>
  );
};

interface ScatterChanceRailsProps {
  state: EngineScatterState;
  color: string;
  onChange: (state: EngineScatterState) => void;
  onGenerate: () => void;
}

const ScatterChanceRails: React.FC<ScatterChanceRailsProps> = ({
  state,
  color,
  onChange,
  onGenerate,
}) => {
  const walkEnabled = Boolean(state.randomWalkEnabled);
  const patchChance = (patch: Partial<Pick<EngineScatterState, 'triggerProbability' | 'burstProbability'>>) => {
    const next = {
      ...state,
      ...patch,
    };
    onChange({
      ...next,
      randomWalk: next.randomWalkEnabled
        ? derivedWalkFromChances(next.triggerProbability, next.burstProbability)
        : next.randomWalk,
    });
  };
  const cycleMode = () => {
    const nextWalkEnabled = !walkEnabled;
    onChange({
      ...state,
      randomWalkEnabled: nextWalkEnabled,
      randomWalk: nextWalkEnabled
        ? derivedWalkFromChances(state.triggerProbability, state.burstProbability)
        : state.randomWalk,
    });
  };

  return (
    <div className="scatter-chance-rails">
      <ScatterVerticalChanceSlider
        label="Trigger"
        side="left"
        value={state.triggerProbability}
        walkEnabled={walkEnabled}
        onChange={(value) => patchChance({ triggerProbability: value })}
        onCycleMode={cycleMode}
      />
      <ScatterFeelChamber
        state={state}
        color={color}
        onChange={onChange}
        onGenerate={onGenerate}
      />
      <ScatterVerticalChanceSlider
        label="Burst"
        side="right"
        value={state.burstProbability}
        walkEnabled={walkEnabled}
        onChange={(value) => patchChance({ burstProbability: value })}
        onCycleMode={cycleMode}
      />
    </div>
  );
};

interface ScatterFeelChamberProps {
  state: EngineScatterState;
  color: string;
  onChange: (state: EngineScatterState) => void;
  onGenerate: () => void;
}

const ScatterFeelChamber: React.FC<ScatterFeelChamberProps> = ({
  state,
  color,
  onChange,
  onGenerate,
}) => (
  <div
    className="scatter-feel-chamber"
    style={{ '--engine-color': color } as React.CSSProperties}
  >
    <FeelField2D
      value={{ x: state.feelX, y: state.feelY }}
      color={color}
      size="large"
      disabled={!state.enabled}
      onChange={(value) => onChange({ ...state, feelX: value.x, feelY: value.y })}
      onGenerate={onGenerate}
    />
  </div>
);

interface ScatterEngineToggleProps {
  voice: DrumVoiceType;
  state: EngineScatterState;
  selected: boolean;
  activeUntil?: number;
  phraseCount: number;
  onToggle: () => void;
}

const ScatterEngineToggle: React.FC<ScatterEngineToggleProps> = ({
  voice,
  state,
  selected,
  activeUntil,
  phraseCount,
  onToggle,
}) => {
  const cfg = DRUM_VOICES[voice];
  const isPulsing = (activeUntil ?? 0) > Date.now();

  return (
    <button
      type="button"
      className={[
        'scatter-engine-toggle',
        state.enabled ? 'active' : 'inactive',
        selected ? 'selected' : '',
        isPulsing ? 'pulsing' : '',
      ].filter(Boolean).join(' ')}
      style={{ '--engine-color': cfg.color } as React.CSSProperties}
      aria-pressed={state.enabled}
      title={state.enabled ? `Disable ${cfg.label}` : `Enable ${cfg.label}`}
      aria-label={state.enabled ? `Disable ${cfg.label}` : `Enable ${cfg.label}`}
      onClick={onToggle}
    >
      <span className="scatter-engine-toggle__icon">{cfg.icon}</span>
      {phraseCount > 0 && (
        <span className="scatter-engine-toggle__memory" aria-label={`${phraseCount} generated phrases`}>
          {phraseCount}
        </span>
      )}
    </button>
  );
};

interface ScatterPhraseMemoryButtonProps {
  phrase: GeneratedDrumPhrase;
  index: number;
  selected: boolean;
  onSelect: () => void;
}

const ScatterPhraseMemoryButton: React.FC<ScatterPhraseMemoryButtonProps> = ({
  phrase,
  index,
  selected,
  onSelect,
}) => {
  const pattern = resolveTriggerClip(phrase.triggerClip);
  const points = pattern.map((enabled, stepIndex) => {
    const t = pattern.length <= 1 ? 0 : stepIndex / (pattern.length - 1);
    const value = phrase.pitch[stepIndex] ?? 0;
    return {
      enabled,
      index: stepIndex,
      x: 4 + t * 92,
      y: Math.max(10, Math.min(34, 22 - Math.max(-12, Math.min(12, value)) * 0.5)),
      probability: phrase.probability[stepIndex] ?? 1,
      ratchet: phrase.ratchet[stepIndex] ?? 1,
    };
  });
  const enabledPoints = points.filter((point) => point.enabled);
  const connectorSegments = enabledPoints.slice(1).map((point, pointIndex) => ({
    from: enabledPoints[pointIndex],
    to: point,
  })).filter((segment): segment is { from: (typeof points)[number]; to: (typeof points)[number] } => Boolean(segment.from));

  return (
    <button
      type="button"
      className={`scatter-phrase-memory${selected ? ' selected' : ''}`}
      title={`${phrase.label} · ${phrase.summary.hits}/${phrase.summary.steps} · ${phrase.summary.contour}`}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className="scatter-phrase-memory__top">
        <span>{index + 1}</span>
        <span>{phrase.summary.hits}/{phrase.summary.steps}</span>
      </span>
      <span className="scatter-phrase-memory__glyph" aria-hidden="true">
        <svg viewBox="0 0 100 44" preserveAspectRatio="none">
          {connectorSegments.map((segment) => (
            <line
              key={`${segment.from.index}-${segment.to.index}`}
              x1={segment.from.x}
              y1={segment.from.y}
              x2={segment.to.x}
              y2={segment.to.y}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        {points.map((point) => (
          <span
            key={point.index}
            className={`scatter-phrase-memory__dot${point.enabled ? ' on' : ''}${point.ratchet > 1 ? ' ratchet' : ''}`}
            style={{
              left: `${point.x}%`,
              top: `${(point.y / 44) * 100}%`,
              opacity: point.enabled ? Math.max(0.32, point.probability) : 0.16,
            }}
          />
        ))}
      </span>
      <span className="scatter-phrase-memory__contour">{phrase.summary.contour}</span>
    </button>
  );
};

interface ScatterActiveEngineCardProps {
  voice: DrumVoiceType;
  engineState: EngineScatterState;
  phrases: GeneratedDrumPhrase[];
  selected: boolean;
  color: string;
  laneCount: number;
  laneNames: string[];
  laneColors: string[];
  onSelect: () => void;
  onChange: (state: EngineScatterState) => void;
  onGenerate: () => GeneratedDrumPhrase;
  onPreview: () => void;
  onPlayPhrase: (phrase: GeneratedDrumPhrase) => void;
  onPrint: (phrase: GeneratedDrumPhrase, laneIndex: number) => void;
}

const ScatterActiveEngineCard: React.FC<ScatterActiveEngineCardProps> = ({
  voice,
  engineState,
  phrases,
  selected,
  color,
  laneCount,
  laneNames,
  laneColors,
  onSelect,
  onChange,
  onGenerate,
  onPreview,
  onPlayPhrase,
  onPrint,
}) => {
  const cfg = DRUM_VOICES[voice];
  const latestPhraseId = phrases[0]?.id ?? null;
  const [selectedPhraseId, setSelectedPhraseId] = useState<string | null>(latestPhraseId);
  useEffect(() => {
    setSelectedPhraseId(latestPhraseId);
  }, [latestPhraseId]);
  const phrase = phrases.find((candidate) => candidate.id === selectedPhraseId) ?? phrases[0] ?? null;

  return (
    <section
      className={`scatter-active-card${selected ? ' selected' : ''}`}
      style={{ '--engine-color': color } as React.CSSProperties}
      onFocus={onSelect}
    >
      <header className="scatter-active-card__header">
        <button
          type="button"
          className="scatter-active-card__identity"
          onClick={onSelect}
          title={`Select ${cfg.label}`}
        >
          <span className="scatter-active-card__icon">{cfg.icon}</span>
          <span>{cfg.label}</span>
        </button>
        <div className="scatter-active-card__actions">
          <button
            type="button"
            className="scatter-active-card__action"
            onClick={() => (phrase ? onPlayPhrase(phrase) : onPreview())}
            title={phrase ? `Play ${phrase.label}` : `Preview ${cfg.label}`}
          >
            ▶
          </button>
          <button
            type="button"
            className="scatter-active-card__action"
            onClick={onGenerate}
            title={`Generate ${cfg.label} phrase`}
          >
            ✦
          </button>
        </div>
      </header>

      <div className="scatter-active-card__editor">
        <ScatterChanceRails
          state={engineState}
          color={color}
          onChange={onChange}
          onGenerate={onGenerate}
        />
      </div>

      <div className="scatter-active-card__phrase">
        {phrase ? (
          <>
            <div className="scatter-active-card__memory" aria-label={`${cfg.label} recent patterns`}>
              {phrases.slice(0, 3).map((memoryPhrase, memoryIndex) => (
                <ScatterPhraseMemoryButton
                  key={memoryPhrase.id}
                  phrase={memoryPhrase}
                  index={memoryIndex}
                  selected={memoryPhrase.id === phrase.id}
                  onSelect={() => setSelectedPhraseId(memoryPhrase.id)}
                />
              ))}
            </div>
            <div className="scatter-print-targets scatter-print-targets--card">
              {Array.from({ length: laneCount }, (_, laneIndex) => (
                <button
                  key={laneIndex}
                  type="button"
                  className="scatter-print-target"
                  style={{
                    '--lane-color': laneColors[laneIndex] ?? laneColors[0] ?? '#b8e0ff',
                  } as React.CSSProperties}
                  onClick={() => onPrint(phrase, laneIndex)}
                >
                  <span>{laneNames[laneIndex] ?? `Seq ${laneIndex + 1}`}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="scatter-active-card__phrase-empty" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
        )}
      </div>
    </section>
  );
};

const ScatterPage: React.FC<ScatterPageProps> = ({
  state,
  sliderState,
  laneCount,
  laneNames,
  laneColors,
  getBpm,
  runtimeActivePulses,
  onStateChange,
  onPrintPhrase,
  onPreviewEngine,
  onPreviewEngineWithState,
}) => {
  const [activePulses, setActivePulses] = useState<Record<string, number>>({});
  const selectedEngine = state.selectedEngine;
  const activeVoices = useMemo(() => (
    DRUM_VOICE_ORDER.filter((voice) => state.engines[voice].enabled)
  ), [state.engines]);
  const activeSelectedEngine = state.engines[selectedEngine]?.enabled
    ? selectedEngine
    : activeVoices[0] ?? selectedEngine;
  const hasGeneratedPhrase = activeVoices.some((voice) => (state.recentPhrasesByEngine[voice] ?? []).length > 0);

  const updateEngine = useCallback((voice: DrumVoiceType, nextEngineState: EngineScatterState) => {
    onStateChange({
      ...state,
      engines: {
        ...state.engines,
        [voice]: nextEngineState,
      },
    });
  }, [onStateChange, state]);

  const toggleEngine = useCallback((voice: DrumVoiceType) => {
    const currentEngineState = state.engines[voice];
    const enabled = !currentEngineState.enabled;
    const nextEngines = {
      ...state.engines,
      [voice]: {
        ...currentEngineState,
        enabled,
      },
    };
    const nextSelectedEngine = enabled
      ? voice
      : state.selectedEngine === voice
        ? DRUM_VOICE_ORDER.find((candidate) => candidate !== voice && nextEngines[candidate].enabled) ?? voice
        : state.selectedEngine;

    onStateChange({
      ...state,
      selectedEngine: nextSelectedEngine,
      engines: nextEngines,
    });
  }, [onStateChange, state]);

  const generateFor = useCallback((voice: DrumVoiceType, seed = nextSeed()) => {
    const engineState = state.engines[voice];
    const phrase = generateScatterPhrase({
      engine: voice,
      engineState,
      previousPhrases: state.recentPhrasesByEngine[voice] ?? [],
      seed,
    });
    onStateChange(pushRecentPhrase({
      ...state,
      selectedEngine: voice,
    }, voice, phrase));
    return phrase;
  }, [onStateChange, state]);

  const printPhrase = useCallback((phrase: GeneratedDrumPhrase, laneIndex: number) => {
    onPrintPhrase(phrase, laneIndex, 'replace');
    const nextEngines = {
      ...state.engines,
      [phrase.engine]: {
        ...state.engines[phrase.engine],
        enabled: false,
      },
    };
    const nextSelectedEngine = state.selectedEngine === phrase.engine
      ? DRUM_VOICE_ORDER.find((voice) => nextEngines[voice].enabled) ?? phrase.engine
      : state.selectedEngine;
    onStateChange({
      ...state,
      selectedEngine: nextSelectedEngine,
      engines: nextEngines,
    });
  }, [onPrintPhrase, onStateChange, state]);

  const pulseEngine = useCallback((voice: DrumVoiceType, kind: 'single' | 'burst') => {
    setActivePulses((prev) => ({
      ...prev,
      [voice]: Date.now() + (kind === 'burst' ? 520 : 180),
    }));
  }, []);

  const previewEngineWithOptions = useCallback((voice: DrumVoiceType, options: ScatterPreviewTriggerOptions) => {
    if (onPreviewEngineWithState) {
      onPreviewEngineWithState(voice, options);
    } else {
      onPreviewEngine?.(voice);
    }
  }, [onPreviewEngine, onPreviewEngineWithState]);

  const handleScatterStepVisual = useCallback((event: ScatterStepVisualEvent) => {
    pulseEngine(event.phrase.engine, 'burst');
  }, [pulseEngine]);

  const triggerSingleScatterEngine = useCallback((voice: DrumVoiceType) => {
    previewEngineWithOptions(voice, {
      velocity: 0.78,
      triggerCritical: false,
    });
    pulseEngine(voice, 'single');
  }, [previewEngineWithOptions, pulseEngine]);

  const { playPhrase, clear: clearPhrasePlayback } = useScatterPhrasePlayer({
    getBpm,
    sliderState,
    trigger: previewEngineWithOptions,
    onStepVisual: handleScatterStepVisual,
  });

  useEffect(() => {
    if (!state.active) clearPhrasePlayback();
  }, [clearPhrasePlayback, state.active]);

  return (
    <div className={`scatter-page${hasGeneratedPhrase ? ' has-selected-phrase' : ''}`}>
      <div className="scatter-topbar">
        <div className="scatter-title">
          <span>Scatter</span>
          <button
            type="button"
            className={`scatter-run-toggle${state.active ? ' active' : ''}`}
            onClick={() => onStateChange({ ...state, active: !state.active })}
            aria-pressed={state.active}
            aria-label={state.active ? 'Stop Scatter' : 'Start Scatter'}
            title={state.active ? 'Stop Scatter' : 'Start Scatter'}
          >
            {state.active ? '■' : '✹'}
          </button>
        </div>

        <div className="scatter-engine-strip" aria-label="Scatter engines">
          {DRUM_VOICE_ORDER.map((voice) => (
            <ScatterEngineToggle
              key={voice}
              voice={voice}
              state={state.engines[voice]}
              selected={voice === activeSelectedEngine}
              activeUntil={Math.max(activePulses[voice] ?? 0, runtimeActivePulses?.[voice] ?? 0)}
              phraseCount={(state.recentPhrasesByEngine[voice] ?? []).length}
              onToggle={() => toggleEngine(voice)}
            />
          ))}
        </div>
      </div>

      {activeVoices.length > 0 ? (
        <div className="scatter-active-grid">
          {activeVoices.map((voice) => {
            const phrases = state.recentPhrasesByEngine[voice] ?? [];
            return (
              <ScatterActiveEngineCard
                key={voice}
                voice={voice}
                engineState={state.engines[voice]}
                phrases={phrases}
                selected={voice === activeSelectedEngine}
                color={DRUM_VOICES[voice].color}
                laneCount={laneCount}
                laneNames={laneNames}
                laneColors={laneColors}
                onSelect={() => onStateChange({ ...state, selectedEngine: voice })}
                onChange={(engineState) => updateEngine(voice, engineState)}
                onGenerate={() => generateFor(voice)}
                onPreview={() => triggerSingleScatterEngine(voice)}
                onPlayPhrase={playPhrase}
                onPrint={printPhrase}
              />
            );
          })}
        </div>
      ) : (
        <div className="scatter-empty-generators">
          <span />
          <span />
          <span />
        </div>
      )}

    </div>
  );
};

export default ScatterPage;
