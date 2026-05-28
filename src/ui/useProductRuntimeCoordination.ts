import {
  useProductRuntimeEvolveOverrideCallbacks,
  type ProductRuntimeEvolvedOverrideState,
} from './useProductRuntimeEvolveOverrideCallbacks';
import { useProductRuntimeRangeSync } from './useProductRuntimeRangeSync';
import { useProductRuntimeValueCleanup } from './useProductRuntimeValueCleanup';
import { useProductRuntimeWalkSync } from './useProductRuntimeWalkSync';

type ProductRuntimeCoordinationOptions =
  Parameters<typeof useProductRuntimeRangeSync>[0] &
  Parameters<typeof useProductRuntimeWalkSync>[0] &
  Parameters<typeof useProductRuntimeEvolveOverrideCallbacks>[0] & {
    playbackIsRunning: boolean;
  };

type ProductRuntimeCoordination = {
  drumEvolvedOverrides: ProductRuntimeEvolvedOverrideState | undefined;
  synthEvolvedOverrides: ProductRuntimeEvolvedOverrideState | undefined;
};

export function useProductRuntimeCoordination(options: ProductRuntimeCoordinationOptions): ProductRuntimeCoordination {
  useProductRuntimeRangeSync(options);
  useProductRuntimeWalkSync(options);
  const evolvedOverrides = useProductRuntimeEvolveOverrideCallbacks(options);
  useProductRuntimeValueCleanup(options.playbackIsRunning);

  return evolvedOverrides;
}
