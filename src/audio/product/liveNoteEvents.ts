export type ProductLiveNoteInstrument =
  | 'pad1'
  | 'pad2'
  | 'lead1'
  | 'lead2'
  | 'piano'
  | 'drum';

export type ProductLiveNoteEvent = {
  kind: 'live-note-on' | 'live-note-off';
  eventID: string;
  source: 'midi' | 'computer-keyboard' | 'ui-pad';
  instrument: ProductLiveNoteInstrument;
  channel: number | null;
  note: number;
  velocity: number;
  timestampMs: number;
  timestampHostTime?: number;
  timestampAudioFrame?: number;
};
