import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { UseJourneyResult } from './journeyState';

export type JourneyOverridePromptState = {
  presetName: string;
  journeyName: string;
};

type JourneyOverrideRuntimeSurfaceOptions = {
  activeJourneyPresetName: string;
  journey: Pick<UseJourneyResult, 'stop'>;
  setIsJourneyPlaying: Dispatch<SetStateAction<boolean>>;
  setActiveJourneyPresetName: Dispatch<SetStateAction<string>>;
  setActiveJourneyHasBackup: Dispatch<SetStateAction<boolean>>;
};

type JourneyOverrideRuntimeSurface = {
  journeyOverridePrompt: JourneyOverridePromptState | null;
  resolveJourneyOverridePrompt: (confirmed: boolean) => void;
  confirmOverrideArmedJourneyForStatePreset: (presetName: string) => Promise<boolean>;
};

export function useJourneyOverrideRuntimeSurface({
  activeJourneyPresetName,
  journey,
  setIsJourneyPlaying,
  setActiveJourneyPresetName,
  setActiveJourneyHasBackup,
}: JourneyOverrideRuntimeSurfaceOptions): JourneyOverrideRuntimeSurface {
  const journeyOverridePromptResolveRef = useRef<((confirmed: boolean) => void) | null>(null);
  const [journeyOverridePrompt, setJourneyOverridePrompt] = useState<JourneyOverridePromptState | null>(null);

  const resolveJourneyOverridePrompt = useCallback((confirmed: boolean) => {
    const resolve = journeyOverridePromptResolveRef.current;
    journeyOverridePromptResolveRef.current = null;
    setJourneyOverridePrompt(null);
    resolve?.(confirmed);
  }, []);

  const requestJourneyOverrideConfirmation = useCallback((presetName: string, journeyName: string): Promise<boolean> => {
    journeyOverridePromptResolveRef.current?.(false);
    return new Promise<boolean>((resolve) => {
      journeyOverridePromptResolveRef.current = resolve;
      setJourneyOverridePrompt({ presetName, journeyName });
    });
  }, []);

  useEffect(() => {
    return () => {
      journeyOverridePromptResolveRef.current?.(false);
      journeyOverridePromptResolveRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!journeyOverridePrompt) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        resolveJourneyOverridePrompt(false);
      } else if (event.key === 'Enter') {
        resolveJourneyOverridePrompt(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [journeyOverridePrompt, resolveJourneyOverridePrompt]);

  const confirmOverrideArmedJourneyForStatePreset = useCallback(
    async (presetName: string): Promise<boolean> => {
      if (!activeJourneyPresetName) return true;
      const confirmed = await requestJourneyOverrideConfirmation(presetName, activeJourneyPresetName);
      if (!confirmed) return false;
      journey.stop();
      setIsJourneyPlaying(false);
      setActiveJourneyPresetName('');
      setActiveJourneyHasBackup(false);
      return true;
    },
    [activeJourneyPresetName, journey, requestJourneyOverrideConfirmation, setActiveJourneyHasBackup, setActiveJourneyPresetName, setIsJourneyPlaying],
  );

  return {
    journeyOverridePrompt,
    resolveJourneyOverridePrompt,
    confirmOverrideArmedJourneyForStatePreset,
  };
}
