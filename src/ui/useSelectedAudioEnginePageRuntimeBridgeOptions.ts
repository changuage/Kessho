import { useMemo } from 'react';
import type { SelectedAudioEnginePageRuntimeBridgeOptions } from './useSelectedAudioEnginePageRuntimeBridges';
import {
  useSelectedAudioEnginePageControlRuntimeProps,
  type SelectedAudioEnginePageControlRuntimeProps,
} from './useSelectedAudioEnginePageControlRuntimeProps';
import {
  useSelectedAudioEnginePageSequencerRuntimeProps,
  type SelectedAudioEnginePageSequencerRuntimeProps,
} from './useSelectedAudioEnginePageSequencerRuntimeProps';
import {
  useSelectedAudioEnginePageTelemetryRuntimeProps,
  type SelectedAudioEnginePageTelemetryRuntimeProps,
} from './useSelectedAudioEnginePageTelemetryRuntimeProps';

export type SelectedAudioEnginePageRuntimeBridgeOptionGroups = {
  telemetry: SelectedAudioEnginePageTelemetryRuntimeProps;
  sequencer: SelectedAudioEnginePageSequencerRuntimeProps;
  control: SelectedAudioEnginePageControlRuntimeProps;
};

export function useSelectedAudioEnginePageRuntimeBridgeOptions(
  { telemetry, sequencer, control }: SelectedAudioEnginePageRuntimeBridgeOptionGroups,
): SelectedAudioEnginePageRuntimeBridgeOptions {
  const pageTelemetryRuntimeProps = useSelectedAudioEnginePageTelemetryRuntimeProps(telemetry);
  const pageSequencerRuntimeProps = useSelectedAudioEnginePageSequencerRuntimeProps(sequencer);
  const pageControlRuntimeProps = useSelectedAudioEnginePageControlRuntimeProps(control);

  return useMemo(() => ({
    ...pageTelemetryRuntimeProps,
    ...pageSequencerRuntimeProps,
    ...pageControlRuntimeProps,
  }), [
    pageTelemetryRuntimeProps,
    pageSequencerRuntimeProps,
    pageControlRuntimeProps,
  ]);
}
