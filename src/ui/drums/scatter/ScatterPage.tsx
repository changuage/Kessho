import React, { useCallback, useMemo, useState } from 'react';
import type { DrumVoiceType } from '../../../audio/drumSynth';
import { DRUM_VOICE_ORDER, DRUM_VOICES } from '../../../audio/drumVoiceConfig';
import type { GeneratedDrumPhrase, SeqScatterState } from './scatterTypes';
import { generateScatterPhrase } from './scatterPhraseGenerator';
import type { PhrasePrintMode } from './scatterPhrasePrinter';
import { pushRecentPhrase } from './scatterDefaults';
import EngineScatterCard from './EngineScatterCard';
import FeelField2D from './FeelField2D';
import PhraseMemoryShelf from './PhraseMemoryShelf';
import PhraseGlyphCard from './PhraseGlyphCard';
import ScatterAdvancedDrawer from './ScatterAdvancedDrawer';
import './scatter.css';

interface ScatterPageProps {
  state: SeqScatterState;
  laneCount: number;
  laneNames: string[];
  onStateChange: (state: SeqScatterState) => void;
  onPrintPhrase: (phrase: GeneratedDrumPhrase, laneIndex: number, mode: PhrasePrintMode) => void;
  onPreviewEngine?: (voice: DrumVoiceType) => void;
}

const PRINT_MODES: Array<{ mode: PhrasePrintMode; label: string }> = [
  { mode: 'replace', label: 'Replace' },
  { mode: 'triggerOnly', label: 'Trigger' },
  { mode: 'modsOnly', label: 'Mods' },
  { mode: 'toneOnly', label: 'Tone' },
  { mode: 'motionOnly', label: 'Motion' },
  { mode: 'spaceOnly', label: 'Space' },
  { mode: 'glitchOnly', label: 'Glitch' },
];

function nextSeed(): number {
  return Math.floor(Date.now() % 2147483647);
}

const ScatterPage: React.FC<ScatterPageProps> = ({
  state,
  laneCount,
  laneNames,
  onStateChange,
  onPrintPhrase,
  onPreviewEngine,
}) => {
  const [printMode, setPrintMode] = useState<PhrasePrintMode>('replace');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const selectedEngine = state.selectedEngine;
  const selectedEngineState = state.engines[selectedEngine];
  const selectedColor = DRUM_VOICES[selectedEngine].color;
  const selectedPhrases = state.recentPhrasesByEngine[selectedEngine] ?? [];

  const updateEngine = useCallback((voice: DrumVoiceType, nextEngineState: typeof selectedEngineState) => {
    onStateChange({
      ...state,
      engines: {
        ...state.engines,
        [voice]: nextEngineState,
      },
    });
  }, [onStateChange, selectedEngineState, state]);

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
    onPrintPhrase(phrase, laneIndex, printMode);
  }, [onPrintPhrase, printMode]);

  const phraseToPrint = useMemo(() => selectedPhrases[0] ?? null, [selectedPhrases]);

  return (
    <div className="scatter-page">
      <div className="scatter-page__top">
        <div className="scatter-title">
          <span>Scatter</span>
          <button type="button" onClick={() => generateFor(selectedEngine)}>Generate</button>
        </div>
        <div className="scatter-print-mode">
          {PRINT_MODES.map((item) => (
            <button
              key={item.mode}
              type="button"
              className={printMode === item.mode ? 'active' : ''}
              onClick={() => setPrintMode(item.mode)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="scatter-engine-grid">
        {DRUM_VOICE_ORDER.map((voice) => (
          <EngineScatterCard
            key={voice}
            voice={voice}
            state={state.engines[voice]}
            phrases={state.recentPhrasesByEngine[voice] ?? []}
            selected={voice === selectedEngine}
            onSelect={() => onStateChange({ ...state, selectedEngine: voice })}
            onToggleEnabled={() => updateEngine(voice, { ...state.engines[voice], enabled: !state.engines[voice].enabled })}
            onChange={(engineState) => updateEngine(voice, engineState)}
            onGenerate={() => generateFor(voice)}
            onPreview={onPreviewEngine ? () => onPreviewEngine(voice) : undefined}
          />
        ))}
      </div>

      <div className="scatter-selected">
        <div className="scatter-selected__field">
          <div className="scatter-selected__label-row">
            <div className="scatter-selected__label" style={{ color: selectedColor }}>
              {DRUM_VOICES[selectedEngine].label}
            </div>
            {onPreviewEngine && (
              <button
                type="button"
                className="scatter-selected__preview"
                onClick={() => onPreviewEngine(selectedEngine)}
                title={`Preview ${DRUM_VOICES[selectedEngine].label}`}
              >
                ▶︎
              </button>
            )}
          </div>
          <FeelField2D
            value={{ x: selectedEngineState.feelX, y: selectedEngineState.feelY }}
            color={selectedColor}
            size="large"
            disabled={!selectedEngineState.enabled}
            onChange={(value) => updateEngine(selectedEngine, { ...selectedEngineState, feelX: value.x, feelY: value.y })}
            onGenerate={() => generateFor(selectedEngine)}
          />
        </div>

        <div className="scatter-selected__memory">
          <PhraseMemoryShelf
            phrases={selectedPhrases}
            onPrint={(phrase) => printPhrase(phrase, 0)}
            onPin={(phrase) => onStateChange({ ...state, pinnedPhrases: [phrase, ...state.pinnedPhrases].slice(0, 24) })}
            onMutate={(phrase) => generateFor(phrase.engine, phrase.seed + 1)}
          />
        </div>
      </div>

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

      <button
        type="button"
        className="scatter-advanced-toggle"
        onClick={() => setAdvancedOpen((open) => !open)}
      >
        {advancedOpen ? 'Hide Advanced' : 'Advanced'}
      </button>
      <ScatterAdvancedDrawer
        open={advancedOpen}
        engineState={selectedEngineState}
        onChange={(engineState) => updateEngine(selectedEngine, engineState)}
      />
    </div>
  );
};

export default ScatterPage;
