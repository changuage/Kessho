import React from 'react';
import type { SliderState } from '../state';
import { DRUM_VOICES, DRUM_VOICE_ORDER } from '../../audio/drumVoiceConfig';
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
  SliderComponent: React.ComponentType<Record<string, unknown>>;
  CollapsiblePanelComponent: React.ComponentType<Record<string, unknown>>;
  editingVoice?: string | null;
  onToggleEditing?: (voice: string) => void;
  triggeredVoices?: Record<string, boolean>;
  getAnalyserNode?: (voice: DrumVoiceType) => AnalyserNode | undefined;
}

const VOICE_PANEL_IDS: Record<DrumVoiceType, string> = {
  sub: 'drumSub',
  kick: 'drumKick',
  click: 'drumClick',
  beepHi: 'drumBeepHi',
  beepLo: 'drumBeepLo',
  noise: 'drumNoise',
  membrane: 'drumMembrane',
};

const DrumPanel: React.FC<DrumPanelProps> = ({
  state,
  isMobile,
  expandedPanels,
  togglePanel,
  onParamChange,
  sliderProps,
  getPresetNames,
  triggerVoice,
  SliderComponent,
  CollapsiblePanelComponent,
  editingVoice,
  onToggleEditing,
  triggeredVoices,
  getAnalyserNode,
}) => {
  return (
    <>
      {DRUM_VOICE_ORDER.map((voice) => (
        <VoiceCard
          key={voice}
          voice={voice}
          config={DRUM_VOICES[voice]}
          panelId={VOICE_PANEL_IDS[voice]}
          state={state}
          isMobile={isMobile}
          isExpanded={expandedPanels.has(VOICE_PANEL_IDS[voice])}
          togglePanel={togglePanel}
          onParamChange={onParamChange}
          sliderProps={sliderProps}
          getPresetNames={getPresetNames}
          triggerVoice={triggerVoice}
          SliderComponent={SliderComponent}
          CollapsiblePanelComponent={CollapsiblePanelComponent}
          editingVoice={editingVoice}
          onToggleEditing={onToggleEditing}
          isTriggered={triggeredVoices?.[voice] ?? false}
          analyserNode={getAnalyserNode?.(voice)}
        />
      ))}
    </>
  );
};

export default DrumPanel;
