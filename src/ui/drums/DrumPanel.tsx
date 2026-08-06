import React from 'react';
import type { SliderMode, SliderState } from '../state';
import type { SliderRendererProps, SliderRuntimeRendererProps } from '../sliderSystem';
import { DRUM_VOICES, DRUM_VOICE_ORDER, DRUM_VOICE_SCOPES } from '../../audio/drumVoiceConfig';
import type { DrumVoiceType } from '../../audio/drumSynth';
import VoiceCard from './VoiceCard';

interface DrumPanelProps {
  state: SliderState;
  isMobile: boolean;
  expandedPanels: Set<string>;
  togglePanel: (id: string) => void;
  onParamChange: (key: keyof SliderState, value: SliderState[keyof SliderState]) => void;
  sliderProps: (paramKey: keyof SliderState) => SliderRuntimeRendererProps<keyof SliderState>;
  getPresetNames: (voice: DrumVoiceType) => string[];
  triggerVoice: (voice: DrumVoiceType) => void;
  onAuditionPresetPreview?: (voice: DrumVoiceType, externalState: SliderState) => void | Promise<void>;
  onStateChange?: React.Dispatch<React.SetStateAction<SliderState>>;
  SliderComponent: React.ComponentType<SliderRendererProps<keyof SliderState>>;
  editingVoice?: string | null;
  onToggleEditing?: (voice: string) => void;
  triggeredVoices?: Record<string, boolean>;
  getAnalyserNode?: (voice: DrumVoiceType) => AnalyserNode | undefined;
  preloadAudioEngine?: () => Promise<unknown>;
  liveCaptureEnabled?: boolean;
  sliderModes?: Record<string, SliderMode>;
  dualSliderRanges?: Record<string, { min: number; max: number }>;
  onDualStateChange?: (
    relevantKeys: string[],
    dualRanges?: Record<string, { min: number; max: number }>,
    sliderModes?: Record<string, SliderMode>,
  ) => void;
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
  editingVoice,
  onToggleEditing,
  triggeredVoices,
  getAnalyserNode,
  preloadAudioEngine,
  liveCaptureEnabled = true,
  sliderModes,
  dualSliderRanges,
  onDualStateChange,
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
          editingVoice={editingVoice}
          onToggleEditing={onToggleEditing}
          isTriggered={triggeredVoices?.[voice] ?? false}
          getAnalyserNode={getAnalyserNode}
          preloadAudioEngine={preloadAudioEngine}
          liveCaptureEnabled={liveCaptureEnabled}
          sliderModes={sliderModes}
          dualSliderRanges={dualSliderRanges}
          onDualStateChange={onDualStateChange}
        />
      ))}
    </>
  );
};

export default DrumPanel;
