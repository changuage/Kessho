import { useCallback, useRef, useState } from 'react';
import { saveVisualizerPreset, type VisualizerPresetData } from './visualizerPresetStore';

type VisualizerPresetSaveOptions = {
  name: string;
  mode: VisualizerPresetData['mode'];
  controls: VisualizerPresetData['controls'];
  reactiveRanges: VisualizerPresetData['reactiveRanges'];
  vizSliderModes: VisualizerPresetData['vizSliderModes'];
  reaction: VisualizerPresetData['reaction'];
  performanceMacros: VisualizerPresetData['performanceMacros'];
  layerMacros: VisualizerPresetData['layerMacros'];
  qualityMode: VisualizerPresetData['qualityMode'];
  seed: VisualizerPresetData['seed'];
  setActivePresetName: (name: string) => void;
  onVisualizerPresetChange: (name: string) => void;
  refreshPresets: () => void;
};

export function useVisualizerPresetSave({
  name,
  mode,
  controls,
  reactiveRanges,
  vizSliderModes,
  reaction,
  performanceMacros,
  layerMacros,
  qualityMode,
  seed,
  setActivePresetName,
  onVisualizerPresetChange,
  refreshPresets,
}: VisualizerPresetSaveOptions): {
  presetSaving: boolean;
  presetSaveError: string;
  handleSavePreset: () => Promise<void>;
} {
  const [presetSaving, setPresetSaving] = useState(false);
  const [presetSaveError, setPresetSaveError] = useState('');
  const presetSaveInFlightRef = useRef(false);
  const handleSavePreset = useCallback(async () => {
    const trimmedName = name.trim();
    if (!trimmedName || presetSaveInFlightRef.current) return;
    presetSaveInFlightRef.current = true;
    setPresetSaveError('');
    setPresetSaving(true);
    try {
      const data: VisualizerPresetData = { format: 'kessho-visualizer-preset', formatVersion: 2, mode, controls, reactiveRanges, vizSliderModes, reaction, performanceMacros, layerMacros, qualityMode, seed };
      const saved = await saveVisualizerPreset(trimmedName, data);
      if (!saved) throw new Error('Visualizer preset could not be saved.');
      setActivePresetName(saved.name);
      onVisualizerPresetChange(saved.name);
      refreshPresets();
    } catch (error) {
      setPresetSaveError(error instanceof Error ? error.message : 'Visualizer preset save failed.');
    } finally {
      presetSaveInFlightRef.current = false;
      setPresetSaving(false);
    }
  }, [controls, layerMacros, mode, name, onVisualizerPresetChange, performanceMacros, qualityMode, reaction, reactiveRanges, refreshPresets, seed, setActivePresetName, vizSliderModes]);
  return { presetSaving, presetSaveError, handleSavePreset };
}
