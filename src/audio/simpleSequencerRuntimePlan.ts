export type SimpleSequencerVizKind = 'padChord' | 'randomTiming';
export type SimpleSequencerVizSource = 'pad1' | 'pad2' | 'lead1' | 'lead2' | 'piano';

export interface SimpleSequencerVizEnvelope {
  attack: number;
  decay: number;
  sustain: number;
  gateSeconds: number;
  release: number;
}

export interface SimpleSequencerVizNote {
  id: string;
  source: SimpleSequencerVizSource;
  midi: number;
  label: string;
  voiceIndex?: number;
  triggerSeconds: number;
  triggerWallSec?: number;
  velocity: number;
  envelope: SimpleSequencerVizEnvelope;
}

export interface SimpleSequencerPhrasePreview {
  kind: SimpleSequencerVizKind;
  enabled: boolean;
  phraseSeconds: number;
  triggerIntervalSeconds: number;
  notes: SimpleSequencerVizNote[];
  minMidi: number;
  maxMidi: number;
  rangeMinMidi?: number;
  rangeMaxMidi?: number;
  phraseIndex?: number;
  phraseStartWallSec?: number;
  key: string;
}
