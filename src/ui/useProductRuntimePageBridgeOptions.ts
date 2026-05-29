import { useMemo } from 'react';
import type { ProductRuntimePageRuntimeBridgeOptions } from './useProductRuntimePageRuntimeBridges';
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
): ProductRuntimePageRuntimeBridgeOptions {
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
