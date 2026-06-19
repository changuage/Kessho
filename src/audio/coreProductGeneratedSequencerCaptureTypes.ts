export type GeneratedSequencerCaptureSourceMode =
  | 'euclid'
  | 'anchorWalker'
  | 'orbit';

export interface GeneratedSequencerCaptureEvent {
  eventId: number;
  absoluteSample: number;
  sourceLaneIndex: number;
  sourceMode: GeneratedSequencerCaptureSourceMode;
  targetSourceId: number;
  midiNote: number;
  velocity: number;
  gateSeconds: number;
  sourceStepIndex: number | null;
  sourceLayerIndex: number | null;
  sourceNoteIndex: number | null;
  targetStepIndex: number | null;
  targetStepFloat: number | null;
  nudge: number;
}

export function productCaptureModeFromId(id: number): GeneratedSequencerCaptureSourceMode {
  if (id === 1) return 'anchorWalker';
  if (id === 2) return 'orbit';
  return 'euclid';
}
