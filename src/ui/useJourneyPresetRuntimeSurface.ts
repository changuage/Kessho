import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import type { SaveJourneyPresetOptions, UseJourneyPresetsResult } from '../presets/useJourneyPresets';
import { validateJourneyConfig, type JourneyValidationResult } from '../presets/journeyPresetCodec';
import type { UseJourneyResult } from './journeyState';

type UseJourneyPresetRuntimeSurfaceOptions = {
  journeyConfig: UseJourneyResult['config'];
  hasJourneyPresetBackup: (name: string) => Promise<boolean>;
};

type JourneyPresetRuntimeSurface = {
  activeJourneyPresetName: string;
  setActiveJourneyPresetName: Dispatch<SetStateAction<string>>;
  activeJourneyValidation: JourneyValidationResult;
  setActiveJourneyValidation: Dispatch<SetStateAction<JourneyValidationResult>>;
  activeJourneyHasBackup: boolean;
  setActiveJourneyHasBackup: Dispatch<SetStateAction<boolean>>;
};

type JourneyPresetActionSurfaceOptions = {
  activeJourneyPresetName: string;
  journey: Pick<UseJourneyResult, 'config' | 'setConfig' | 'stop'>;
  journeyPresets: Pick<UseJourneyPresetsResult, 'load' | 'save' | 'rename' | 'remove' | 'restoreBackup' | 'hasBackup' | 'validate'>;
  fadeOutAndStopForPresetLoad: () => Promise<void>;
  stopJourneyMorphPlayback: (commitRuntimeState?: boolean) => void;
  setIsJourneyPlaying: Dispatch<SetStateAction<boolean>>;
  setActiveJourneyPresetName: Dispatch<SetStateAction<string>>;
  setActiveJourneyValidation: Dispatch<SetStateAction<JourneyValidationResult>>;
  setActiveJourneyHasBackup: Dispatch<SetStateAction<boolean>>;
};

type JourneyPresetActionSurface = {
  handleLoadJourneyPreset: (name: string) => Promise<void>;
  handleSaveJourneyPreset: (
    name: string,
    description?: string,
    intent?: Pick<SaveJourneyPresetOptions, 'overwriteExisting'>,
  ) => Promise<Awaited<ReturnType<UseJourneyPresetsResult['save']>>>;
  handleRenameJourneyPreset: (name: string, nextName: string, description?: string) => Promise<Awaited<ReturnType<UseJourneyPresetsResult['rename']>>>;
  handleDeleteJourneyPreset: (name: string) => Promise<boolean>;
  handleUndoJourneyPreset: () => Promise<void>;
};

export function useJourneyPresetRuntimeSurface({
  journeyConfig,
  hasJourneyPresetBackup,
}: UseJourneyPresetRuntimeSurfaceOptions): JourneyPresetRuntimeSurface {
  const [activeJourneyPresetName, setActiveJourneyPresetName] = useState('');
  const [activeJourneyValidation, setActiveJourneyValidation] = useState<JourneyValidationResult>(() => validateJourneyConfig(null));
  const [activeJourneyHasBackup, setActiveJourneyHasBackup] = useState(false);

  useEffect(() => {
    setActiveJourneyValidation(validateJourneyConfig(journeyConfig));
  }, [journeyConfig]);

  useEffect(() => {
    let cancelled = false;
    if (!activeJourneyPresetName) {
      setActiveJourneyHasBackup(false);
      return;
    }
    hasJourneyPresetBackup(activeJourneyPresetName)
      .then((hasBackup) => {
        if (!cancelled) setActiveJourneyHasBackup(hasBackup);
      })
      .catch(() => {
        if (!cancelled) setActiveJourneyHasBackup(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeJourneyPresetName, hasJourneyPresetBackup]);

  return {
    activeJourneyPresetName,
    setActiveJourneyPresetName,
    activeJourneyValidation,
    setActiveJourneyValidation,
    activeJourneyHasBackup,
    setActiveJourneyHasBackup,
  };
}

export function useJourneyPresetActionSurface({
  activeJourneyPresetName,
  journey,
  journeyPresets,
  fadeOutAndStopForPresetLoad,
  stopJourneyMorphPlayback,
  setIsJourneyPlaying,
  setActiveJourneyPresetName,
  setActiveJourneyValidation,
  setActiveJourneyHasBackup,
}: JourneyPresetActionSurfaceOptions): JourneyPresetActionSurface {
  const handleLoadJourneyPreset = useCallback(
    async (name: string) => {
      if (!name) return;
      await fadeOutAndStopForPresetLoad();
      const loaded = await journeyPresets.load(name);
      if (!loaded) return;
      journey.stop();
      stopJourneyMorphPlayback(true);
      setIsJourneyPlaying(false);
      journey.setConfig(loaded.config);
      setActiveJourneyPresetName(loaded.entry.name);
      setActiveJourneyValidation(loaded.validation);
      setActiveJourneyHasBackup(await journeyPresets.hasBackup(loaded.entry.name));
    },
    [
      fadeOutAndStopForPresetLoad,
      journey,
      journeyPresets,
      setActiveJourneyHasBackup,
      setActiveJourneyPresetName,
      setActiveJourneyValidation,
      setIsJourneyPlaying,
      stopJourneyMorphPlayback,
    ],
  );

  const handleSaveJourneyPreset = useCallback(
    async (
      name: string,
      description?: string,
      intent: Pick<SaveJourneyPresetOptions, 'overwriteExisting'> = {},
    ) => {
      if (!journey.config) return null;
      const entry = await journeyPresets.save(name, journey.config, {
        ...(description === undefined ? {} : { description }),
        sourceName: activeJourneyPresetName || undefined,
        ...intent,
      });
      if (!entry) return null;
      setActiveJourneyPresetName(entry.name);
      setActiveJourneyValidation(journeyPresets.validate({ ...journey.config, name: entry.name }));
      setActiveJourneyHasBackup(await journeyPresets.hasBackup(entry.name));
      return entry;
    },
    [
      activeJourneyPresetName,
      journey.config,
      journeyPresets,
      setActiveJourneyHasBackup,
      setActiveJourneyPresetName,
      setActiveJourneyValidation,
    ],
  );

  const handleRenameJourneyPreset = useCallback(
    async (name: string, nextName: string, description?: string) => {
      const entry = await journeyPresets.rename(name, nextName, description === undefined ? undefined : { description });
      if (!entry) return null;
      if (journey.config) {
        journey.setConfig({ ...journey.config, name: entry.name });
        setActiveJourneyValidation(journeyPresets.validate({ ...journey.config, name: entry.name }));
      }
      setActiveJourneyPresetName(entry.name);
      setActiveJourneyHasBackup(await journeyPresets.hasBackup(entry.name));
      return entry;
    },
    [journey, journeyPresets, setActiveJourneyHasBackup, setActiveJourneyPresetName, setActiveJourneyValidation],
  );

  const handleDeleteJourneyPreset = useCallback(
    async (name: string) => {
      const removed = await journeyPresets.remove(name);
      if (!removed) return false;
      if (activeJourneyPresetName === name) {
        setActiveJourneyPresetName('');
        setActiveJourneyHasBackup(false);
      }
      return true;
    },
    [activeJourneyPresetName, journeyPresets, setActiveJourneyHasBackup, setActiveJourneyPresetName],
  );

  const handleUndoJourneyPreset = useCallback(async () => {
    if (!activeJourneyPresetName) return;
    await fadeOutAndStopForPresetLoad();
    const restored = await journeyPresets.restoreBackup(activeJourneyPresetName);
    if (!restored) return;
    journey.stop();
    stopJourneyMorphPlayback(true);
    setIsJourneyPlaying(false);
    journey.setConfig(restored.config);
    setActiveJourneyPresetName(restored.entry.name);
    setActiveJourneyValidation(restored.validation);
    setActiveJourneyHasBackup(await journeyPresets.hasBackup(restored.entry.name));
  }, [
    activeJourneyPresetName,
    fadeOutAndStopForPresetLoad,
    journey,
    journeyPresets,
    setActiveJourneyHasBackup,
    setActiveJourneyPresetName,
    setActiveJourneyValidation,
    setIsJourneyPlaying,
    stopJourneyMorphPlayback,
  ]);

  return {
    handleLoadJourneyPreset,
    handleSaveJourneyPreset,
    handleRenameJourneyPreset,
    handleDeleteJourneyPreset,
    handleUndoJourneyPreset,
  };
}
