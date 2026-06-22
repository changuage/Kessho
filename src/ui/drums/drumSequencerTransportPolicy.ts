export function shouldAutoEnableDrumLaneOnTransportStart(options: {
  readonly starting: boolean;
  readonly anyLaneEnabled: boolean;
  readonly laneEnableTouched: boolean;
}): boolean {
  return options.starting && !options.anyLaneEnabled && !options.laneEnableTouched;
}

export function drumLaneEnableTouchedAfterPresetRestore(options: {
  readonly anyLaneEnabled: boolean;
}): boolean {
  return !options.anyLaneEnabled;
}
