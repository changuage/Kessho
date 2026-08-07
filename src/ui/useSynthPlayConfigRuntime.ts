import { useCallback, useEffect } from 'react';
import type { ProductPlayConfig } from '../audio/productPlaySequencer';
import { normalizeProductPlayConfigs } from '../audio/productPlaySequencer';
import type { HarmonyWorkspaceController } from './harmony/useHarmonyWorkspaceController';

type SynthPlayConfigRuntimeOptions = {
  canonicalSynthPlayConfigs: ProductPlayConfig[];
  onPlayConfigsChange: (configs: ProductPlayConfig[]) => void;
  harmonyWorkspaceController: Pick<HarmonyWorkspaceController, 'commitAuthoredStateChange'>;
};

export function useSynthPlayConfigRuntime({
  canonicalSynthPlayConfigs,
  onPlayConfigsChange,
  harmonyWorkspaceController,
}: SynthPlayConfigRuntimeOptions): {
  canonicalSynthPlayConfigs: ProductPlayConfig[];
  handleSynthPlayConfigsChange: (configs: ProductPlayConfig[]) => void;
} {
  useEffect(() => {
    onPlayConfigsChange(canonicalSynthPlayConfigs);
  }, [canonicalSynthPlayConfigs, onPlayConfigsChange]);
  const handleSynthPlayConfigsChange = useCallback((configs: ProductPlayConfig[]) => {
    const next = normalizeProductPlayConfigs(configs, 4);
    onPlayConfigsChange(next);
    harmonyWorkspaceController.commitAuthoredStateChange((previous) => {
      const current = normalizeProductPlayConfigs(previous.synthPlayConfigs, 4);
      return JSON.stringify(current) === JSON.stringify(next)
        ? previous
        : { ...previous, synthPlayConfigs: next };
    }, undefined, 'Update Seq play configuration');
  }, [harmonyWorkspaceController, onPlayConfigsChange]);
  return { canonicalSynthPlayConfigs, handleSynthPlayConfigsChange };
}
