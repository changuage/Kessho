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
  // Both modulation modes must make the same owner decision for a key. Keep a
  // single callback reference so disabling a source cannot leave one mode
  // registered while the other is removed.
  const isRuntimeRangeKeyEligible = options.isRuntimeRangeKeyEligible ?? (() => true);
  useProductRuntimeRangeSync({ ...options, isRuntimeRangeKeyEligible });
  useProductRuntimeWalkSync({ ...options, isRuntimeRangeKeyEligible });
  const evolvedOverrides = useProductRuntimeEvolveOverrideCallbacks(options);
  useProductRuntimeValueCleanup(options.playbackIsRunning);

  return evolvedOverrides;
}
