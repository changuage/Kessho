import { useMemo } from 'react';
import type { SelectedAudioEnginePageRuntimeBridgeOptions } from './useSelectedAudioEnginePageRuntimeBridges';
import {
  useProductRuntimePageControlProps,
  type ProductRuntimePageControlProps,
} from './useProductRuntimePageControlProps';
import {
  useProductRuntimePageSequencerProps,
  type ProductRuntimePageSequencerProps,
} from './useProductRuntimePageSequencerProps';
import {
  useProductRuntimePageTelemetryProps,
  type ProductRuntimePageTelemetryProps,
} from './useProductRuntimePageTelemetryProps';

export type ProductRuntimePageBridgeOptionGroups = {
  telemetry: ProductRuntimePageTelemetryProps;
  sequencer: ProductRuntimePageSequencerProps;
  control: ProductRuntimePageControlProps;
};

export function useProductRuntimePageBridgeOptions(
  { telemetry, sequencer, control }: ProductRuntimePageBridgeOptionGroups,
): SelectedAudioEnginePageRuntimeBridgeOptions {
  const pageTelemetryRuntimeProps = useProductRuntimePageTelemetryProps(telemetry);
  const pageSequencerRuntimeProps = useProductRuntimePageSequencerProps(sequencer);
  const pageControlRuntimeProps = useProductRuntimePageControlProps(control);

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
