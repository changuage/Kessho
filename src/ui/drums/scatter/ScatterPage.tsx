import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DrumVoiceType } from '../../../audio/drumSynth';
import { DRUM_VOICE_ORDER, DRUM_VOICES } from '../../../audio/drumVoiceConfig';
import type { SliderState } from '../../state';
import type { EngineScatterState, GeneratedDrumPhrase, SeqScatterState } from './scatterTypes';
import { generateScatterPhrase } from './scatterPhraseGenerator';
import type { PhrasePrintMode } from './scatterPhrasePrinter';
import { pushRecentPhrase } from './scatterDefaults';
import EngineScatterOrb from './EngineScatterOrb';
import FeelField2D from './FeelField2D';
import PhraseMemoryShelf from './PhraseMemoryShelf';
import PhraseGlyphCard from './PhraseGlyphCard';
import ScatterTrailField from './ScatterTrailField';
import ScatterAdvancedDrawer from './ScatterAdvancedDrawer';
import { useScatterPhrasePlayer, type ScatterPreviewTriggerOptions, type ScatterStepVisualEvent } from './useScatterPhrasePlayer';
import { useScatterSequencerRuntime } from './useScatterSequencerRuntime';
import './scatter.css';

interface ScatterPageProps {
  state: SeqScatterState;
  sliderState: SliderState;
  laneCount: number;
  laneNames: string[];
  isRunning: boolean;
  getBpm: () => number;
  onStateChange: (state: SeqScatterState) => void;
  onPrintPhrase: (phrase: GeneratedDrumPhrase, laneIndex: number, mode: PhrasePrintMode) => void;
  onPreviewEngine?: (voice: DrumVoiceType) => void;
  onPreviewEngineWithState?: (voice: DrumVoiceType, options: ScatterPreviewTriggerOptions) => void;
}

function nextSeed(): number {
  return Math.floor(Date.now() % 2147483647);
}

const ScatterPage: React.FC<ScatterPageProps> = ({
  state,
  sliderState,
  laneCount,
  laneNames,
  isRunning,
  getBpm,
  onStateChange,
  onPrintPhrase,
  onPreviewEngine,
  onPreviewEngineWithState,
}) => {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [activePulses, setActivePulses] = useState<Record<string, number>>({});
  const [activeStepVisual, setActiveStepVisual] = useState<{
    phraseId: string;
    stepIndex: number;
    ratchetIndex: number;
  } | null>(null);
  const activeStepTimeoutRef = useRef<number | null>(null);
  const selectedEngine = state.selectedEngine;
  const selectedEngineState = state.engines[selectedEngine];
  const selectedColor = DRUM_VOICES[selectedEngine].color;
  const selectedPhrases = state.recentPhrasesByEngine[selectedEngine] ?? [];

  const updateEngine = useCallback((voice: DrumVoiceType, nextEngineState: EngineScatterState) => {
    onStateChange({
      ...state,
      engines: {
        ...state.engines,
        [voice]: nextEngineState,
      },
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
  }, [onPrintPhrase]);

  const phraseToPrint = useMemo(() => selectedPhrases[0] ?? null, [selectedPhrases]);

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
    setActiveStepVisual({
      phraseId: event.phrase.id,
      stepIndex: event.stepIndex,
      ratchetIndex: event.ratchetIndex,
    });
    if (activeStepTimeoutRef.current !== null) {
      window.clearTimeout(activeStepTimeoutRef.current);
    }
    activeStepTimeoutRef.current = window.setTimeout(() => {
      setActiveStepVisual((current) => (
        current?.phraseId === event.phrase.id &&
        current.stepIndex === event.stepIndex &&
        current.ratchetIndex === event.ratchetIndex
          ? null
          : current
      ));
    }, event.ratchetCount > 1 ? 120 : 180);
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

  useEffect(() => () => {
    if (activeStepTimeoutRef.current !== null) {
      window.clearTimeout(activeStepTimeoutRef.current);
    }
  }, []);

  useScatterSequencerRuntime({
    active: state.active,
    isRunning,
    state,
    setState: onStateChange,
    getBpm,
    playPhrase,
    onVisualPulse: pulseEngine,
  });

  const selectedActiveStepVisual = activeStepVisual && phraseToPrint && activeStepVisual.phraseId === phraseToPrint.id
    ? activeStepVisual
    : null;

  return (
    <div className={`scatter-page${phraseToPrint ? ' has-selected-phrase' : ''}`}>
      <div className="scatter-topbar">
        <div className="scatter-title">
          <span>Scatter</span>
          <button
            type="button"
            className={`scatter-ignite${state.active ? ' active' : ''}`}
            onClick={() => onStateChange({ ...state, active: !state.active })}
            aria-pressed={state.active}
          >
            {state.active ? 'Still' : 'Ignite'}
          </button>
        </div>
        <button
          type="button"
          className="scatter-advanced-toggle"
          onClick={() => setAdvancedOpen((open) => !open)}
        >
          {advancedOpen ? 'Hide Advanced' : 'Advanced'}
        </button>
      </div>

      <div className="scatter-orb-grid">
        {DRUM_VOICE_ORDER.map((voice) => (
          <EngineScatterOrb
            key={voice}
            voice={voice}
            state={state.engines[voice]}
            phrases={state.recentPhrasesByEngine[voice] ?? []}
            selected={voice === selectedEngine}
            activeUntil={activePulses[voice]}
            onSelect={() => onStateChange({ ...state, selectedEngine: voice })}
            onToggleEnabled={() => updateEngine(voice, { ...state.engines[voice], enabled: !state.engines[voice].enabled })}
            onChange={(engineState) => updateEngine(voice, engineState)}
            onGenerate={() => generateFor(voice)}
            onPreview={() => triggerSingleScatterEngine(voice)}
          />
        ))}
      </div>

      <div className="scatter-selected-stage">
        <div className="scatter-selected__field">
          <div className="scatter-selected__label-row">
            <div className="scatter-selected__label" style={{ color: selectedColor }}>
              {DRUM_VOICES[selectedEngine].label}
            </div>
            <button
              type="button"
              className="scatter-selected__preview"
              onClick={() => (phraseToPrint ? playPhrase(phraseToPrint) : triggerSingleScatterEngine(selectedEngine))}
              title={phraseToPrint ? `Play ${phraseToPrint.label}` : `Preview ${DRUM_VOICES[selectedEngine].label}`}
            >
              ▶
            </button>
          </div>
          <div className="scatter-selected__field-stack">
            <ScatterTrailField
              phrase={phraseToPrint}
              color={selectedColor}
              activeStep={selectedActiveStepVisual?.stepIndex ?? null}
              activeRatchet={selectedActiveStepVisual?.ratchetIndex ?? null}
            />
            <div className="scatter-selected__feel-panel">
              <FeelField2D
                value={{ x: selectedEngineState.feelX, y: selectedEngineState.feelY }}
                color={selectedColor}
                size="large"
                disabled={!selectedEngineState.enabled}
                onChange={(value) => updateEngine(selectedEngine, { ...selectedEngineState, feelX: value.x, feelY: value.y })}
                onGenerate={() => generateFor(selectedEngine)}
              />
            </div>
          </div>
        </div>

        <div className="scatter-memory-stage">
          <PhraseMemoryShelf
            phrases={selectedPhrases}
            onPrint={(phrase) => printPhrase(phrase, 0)}
            onPin={(phrase) => onStateChange({ ...state, pinnedPhrases: [phrase, ...state.pinnedPhrases].slice(0, 24) })}
            onMutate={(phrase) => generateFor(phrase.engine, phrase.seed + 1)}
          />
          <div className="scatter-print-targets">
            {Array.from({ length: laneCount }, (_, laneIndex) => (
              <button
                key={laneIndex}
                type="button"
                disabled={!phraseToPrint}
                onClick={() => phraseToPrint && printPhrase(phraseToPrint, laneIndex)}
              >
                {laneNames[laneIndex] ?? `Seq ${laneIndex + 1}`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {state.pinnedPhrases.length > 0 && (
        <div className="scatter-pinned">
          {state.pinnedPhrases.map((phrase) => (
            <PhraseGlyphCard
              key={`pin-${phrase.id}`}
              phrase={phrase}
              pinned
              onPrint={() => printPhrase(phrase, 0)}
            />
          ))}
        </div>
      )}

      <ScatterAdvancedDrawer
        open={advancedOpen}
        engineState={selectedEngineState}
        onChange={(engineState) => updateEngine(selectedEngine, engineState)}
      />
    </div>
  );
};

export default ScatterPage;
