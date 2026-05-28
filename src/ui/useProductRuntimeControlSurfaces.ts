import { useProductRuntimeModulationRanges } from './useProductRuntimeModulationRanges';
import { useProductRuntimeMorphRuntimeSurface } from './useProductRuntimeMorphRuntimeSurface';
import { useProductRuntimeSequencerControls } from './useProductRuntimeSequencerControls';

type ProductRuntimeControlSurfacesMode = Parameters<typeof useProductRuntimeModulationRanges>[0];

export function useProductRuntimeControlSurfaces(audioEngineRuntimeMode: ProductRuntimeControlSurfacesMode) {
  const modulationRanges = useProductRuntimeModulationRanges(audioEngineRuntimeMode);
  const morphRuntimeSurface = useProductRuntimeMorphRuntimeSurface(audioEngineRuntimeMode);
  const sequencerControls = useProductRuntimeSequencerControls(audioEngineRuntimeMode);

  return {
    ...modulationRanges,
    ...morphRuntimeSurface,
    ...sequencerControls,
  };
}
