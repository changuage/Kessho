import React from 'react';
import type { SliderState } from '../state';
import { DRUM_VOICES, DRUM_VOICE_ORDER, DRUM_VOICE_SCOPES } from '../../audio/drumVoiceConfig';
import type { DrumVoiceType } from '../../audio/drumSynth';
import VoiceCard from './VoiceCard';

interface DrumPanelProps {
  state: SliderState;
  isMobile: boolean;
  expandedPanels: Set<string>;
  togglePanel: (id: string) => void;
  onParamChange: (key: keyof SliderState, value: SliderState[keyof SliderState]) => void;
  sliderProps: (paramKey: keyof SliderState) => Record<string, unknown>;
  getPresetNames: (voice: DrumVoiceType) => string[];
  triggerVoice: (voice: DrumVoiceType) => void;
  onAuditionPresetPreview?: (voice: DrumVoiceType, externalState: SliderState) => void | Promise<void>;
  onStateChange?: React.Dispatch<React.SetStateAction<SliderState>>;
  SliderComponent: React.ComponentType<Record<string, unknown>>;
  CollapsiblePanelComponent: React.ComponentType<Record<string, unknown>>;
  editingVoice?: string | null;
  onToggleEditing?: (voice: string) => void;
  triggeredVoices?: Record<string, boolean>;
  getAnalyserNode?: (voice: DrumVoiceType) => AnalyserNode | undefined;
  preloadAudioEngine?: () => Promise<unknown>;
  liveCaptureEnabled?: boolean;
}

const DrumPanel: React.FC<DrumPanelProps> = ({
  state,
  isMobile,
  expandedPanels,
  togglePanel,
  onParamChange,
  sliderProps,
  getPresetNames,
  triggerVoice,
  onAuditionPresetPreview,
  onStateChange,
  SliderComponent,
  CollapsiblePanelComponent,
  editingVoice,
  onToggleEditing,
  triggeredVoices,
  getAnalyserNode,
  preloadAudioEngine,
  liveCaptureEnabled = true,
}) => {
  return (
    <>
      {DRUM_VOICE_ORDER.map((voice) => (
        <VoiceCard
          key={voice}
          voice={voice}
          config={DRUM_VOICES[voice]}
          panelId={DRUM_VOICE_SCOPES[voice]}
          state={state}
          isMobile={isMobile}
          isExpanded={expandedPanels.has(DRUM_VOICE_SCOPES[voice])}
          togglePanel={togglePanel}
          onParamChange={onParamChange}
          sliderProps={sliderProps}
          getPresetNames={getPresetNames}
          triggerVoice={triggerVoice}
          onAuditionPresetPreview={onAuditionPresetPreview}
          onStateChange={onStateChange}
          SliderComponent={SliderComponent}
          CollapsiblePanelComponent={CollapsiblePanelComponent}
          editingVoice={editingVoice}
          onToggleEditing={onToggleEditing}
          isTriggered={triggeredVoices?.[voice] ?? false}
          getAnalyserNode={getAnalyserNode}
          preloadAudioEngine={preloadAudioEngine}
          liveCaptureEnabled={liveCaptureEnabled}
        />
      ))}
    </>
  );
};

export default DrumPanel;
