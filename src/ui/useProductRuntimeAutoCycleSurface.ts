import { useMemo } from 'react';
import { createCoreProductSnapshot } from '../audio/coreProductSnapshot';
import { productEngine } from '../audio/product/ProductEngineProxy';
import type { ProductStateRecord } from '../audio/product/ProductEngineTypes';
import {
  compileProductSceneProgram,
  createCoreProductSceneProgramEvents,
} from '../audio/product/scene/compileProductSceneProgram';
import {
  autoCyclePhaseLabel,
  createCoreProductAutoCycleEvent,
} from '../audio/product/scene/compileProductAutoCycle';

type ProductAutoCycleStart = {
  endpointA: ProductStateRecord;
  endpointB: ProductStateRecord;
  initialPosition: number;
  playPhrases: number;
  transitionPhrases: number;
  signal: AbortSignal;
};

export type ProductAutoCycleProjection = {
  enabled: boolean;
  position: number;
  phase: string;
  phaseEndFrame: number;
  absoluteSampleTime: number;
  phraseSeconds: number | null;
  sampleRate: number;
};

export type ProductAutoCycleRuntimeSurface = {
  start(options: ProductAutoCycleStart): Promise<void>;
  stop(clearAssets: boolean): void;
  updateDurations(playPhrases: number, transitionPhrases: number): void;
  readProjection(): ProductAutoCycleProjection | null;
};

export function useProductRuntimeAutoCycleSurface(): ProductAutoCycleRuntimeSurface {
  return useMemo(() => ({
    async start(options) {
      const program = compileProductSceneProgram(
        createCoreProductSnapshot(options.endpointA),
        createCoreProductSnapshot(options.endpointB),
      );
      await productEngine.prepareSceneAssets([options.endpointA, options.endpointB]);
      if (options.signal.aborted) return;
      productEngine.enqueueEvents([
        ...createCoreProductSceneProgramEvents(program),
        createCoreProductAutoCycleEvent({
          enabled: true,
          initialPosition: options.initialPosition,
          playPhrases: options.playPhrases,
          transitionPhrases: options.transitionPhrases,
          revision: program.revision,
        }),
      ]);
    },
    stop(clearAssets) {
      productEngine.enqueueEvent(createCoreProductAutoCycleEvent({
        enabled: false,
        initialPosition: 0,
        playPhrases: 1,
        transitionPhrases: 1,
        revision: 0,
      }));
      if (clearAssets) productEngine.clearSceneAssets();
    },
    updateDurations(playPhrases, transitionPhrases) {
      productEngine.enqueueEvent(createCoreProductAutoCycleEvent({
        enabled: true,
        initialPosition: 0,
        playPhrases,
        transitionPhrases,
        revision: 0,
        preservePhase: true,
      }));
    },
    readProjection() {
      const telemetry = productEngine.getTelemetry();
      if (!telemetry) return null;
      const position = Math.max(0, Math.min(1, telemetry.scenePosition ?? telemetry.autoCyclePosition ?? 0));
      return {
        enabled: telemetry.autoCycleEnabled ?? false,
        position,
        phase: autoCyclePhaseLabel(telemetry.autoCyclePhase ?? 0, position),
        phaseEndFrame: telemetry.autoCyclePhaseEndFrame ?? telemetry.absoluteSampleTime ?? 0,
        absoluteSampleTime: telemetry.absoluteSampleTime ?? 0,
        phraseSeconds: telemetry.transportPhraseSeconds ?? null,
        sampleRate: Math.max(1, telemetry.sampleRate ?? 48_000),
      };
    },
  }), []);
}
