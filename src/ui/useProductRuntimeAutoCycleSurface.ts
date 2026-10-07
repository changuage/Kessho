import { useEffect, useMemo } from 'react';
import { createCoreProductSnapshot } from '../audio/coreProductSnapshot';
import { productEngine } from '../audio/product/ProductEngineProxy';
import type {
  ProductStateRecord,
  ProductTelemetrySnapshot,
} from '../audio/product/ProductEngineTypes';
import {
  compileProductSceneProgram,
  createCoreProductSceneProgramEvents,
} from '../audio/product/scene/compileProductSceneProgram';
import {
  autoCyclePhaseLabel,
  createCoreProductAutoCycleEvent,
} from '../audio/product/scene/compileProductAutoCycle';

export type ProductAutoCycleEndpointPair = {
  endpointA: ProductStateRecord;
  endpointB: ProductStateRecord;
};

type ProductAutoCycleStart = ProductAutoCycleEndpointPair & {
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
  sampleRate: number | null;
  confirmedEndpointA: ProductStateRecord | null;
  confirmedEndpointB: ProductStateRecord | null;
};

export type ProductAutoCycleRuntimeSurface = {
  start(options: ProductAutoCycleStart): Promise<void>;
  replace(options: ProductAutoCycleEndpointPair): Promise<void>;
  stop(clearAssets: boolean): void;
  updateDurations(playPhrases: number, transitionPhrases: number): void;
  readProjection(): ProductAutoCycleProjection | null;
};

type ProductAutoCycleDurations = {
  playPhrases: number;
  transitionPhrases: number;
};

type InstalledProgram = ProductAutoCycleEndpointPair & {
  expectedRevision: number;
};

type UploadedProgram = InstalledProgram & {
  baselineAbsoluteSampleTime: number | null;
};

export function productSceneRevisionOnWire(revision: number): number {
  return Math.round(Math.fround(Number.isFinite(revision) ? revision : 0)) >>> 0;
}

function sameDurations(left: ProductAutoCycleDurations | null, right: ProductAutoCycleDurations): boolean {
  return left?.playPhrases === right.playPhrases && left.transitionPhrases === right.transitionPhrases;
}

export function useProductRuntimeAutoCycleSurface(): ProductAutoCycleRuntimeSurface {
  const surface = useMemo<ProductAutoCycleRuntimeSurface>(() => {
    let lifecycleGeneration = 0;
    let lifecycleActive = false;
    let activeLifecycleSignal: AbortSignal | null = null;
    let installedProgram: InstalledProgram | null = null;
    let uploadedAwaitingAdoption: UploadedProgram | null = null;
    let pendingReplacement: ProductAutoCycleEndpointPair | null = null;
    let latestStartOptions: ProductAutoCycleStart | null = null;
    let latestDurations: ProductAutoCycleDurations | null = null;
    let appliedDurations: ProductAutoCycleDurations | null = null;
    let transactionTail: Promise<void> = Promise.resolve();
    let lifecycleTransaction: Promise<void> | null = null;
    let pendingAdoption: {
      uploaded: UploadedProgram;
      generation: number;
      operationSignal: AbortSignal;
      resolve: (adopted: boolean) => void;
    } | null = null;
    const transactionControllers = new Set<AbortController>();

    const isCurrent = (generation: number, operationSignal: AbortSignal): boolean => lifecycleActive &&
      generation === lifecycleGeneration &&
      !operationSignal.aborted &&
      !(activeLifecycleSignal?.aborted ?? false);

    const prepareStates = (pairs: readonly ProductAutoCycleEndpointPair[]): ProductStateRecord[] => {
      const states: ProductStateRecord[] = [];
      const seen = new Set<ProductStateRecord>();
      for (const pair of pairs) {
        for (const state of [pair.endpointA, pair.endpointB]) {
          if (seen.has(state)) continue;
          seen.add(state);
          states.push(state);
        }
      }
      return states;
    };

    const cancelPendingAdoption = (): void => {
      const pending = pendingAdoption;
      if (!pending) return;
      pendingAdoption = null;
      pending.resolve(false);
    };

    const settlePendingAdoption = (telemetry: ProductTelemetrySnapshot | null): void => {
      const pending = pendingAdoption;
      if (!pending) return;
      if (!isCurrent(pending.generation, pending.operationSignal)) {
        cancelPendingAdoption();
        return;
      }
      if (!telemetry || telemetry.sceneProgramRevision !== pending.uploaded.expectedRevision) return;
      const sampleTime = telemetry.absoluteSampleTime;
      const baselineSampleTime = pending.uploaded.baselineAbsoluteSampleTime;
      if (typeof sampleTime !== 'number' || !Number.isFinite(sampleTime)
        || baselineSampleTime === null || sampleTime <= baselineSampleTime) return;
      installedProgram = {
        endpointA: pending.uploaded.endpointA,
        endpointB: pending.uploaded.endpointB,
        expectedRevision: pending.uploaded.expectedRevision,
      };
      uploadedAwaitingAdoption = null;
      pendingAdoption = null;
      pending.resolve(true);
    };

    const waitForSceneProgramAdoption = (
      uploaded: UploadedProgram,
      generation: number,
      operationSignal: AbortSignal,
    ): Promise<boolean> => new Promise((resolve) => {
      cancelPendingAdoption();
      pendingAdoption = { uploaded, generation, operationSignal, resolve };
    });

    const flushDurations = (generation: number, operationSignal: AbortSignal): void => {
      const durations = latestDurations;
      if (!durations || !installedProgram || !isCurrent(generation, operationSignal)) return;
      if (sameDurations(appliedDurations, durations)) return;
      productEngine.enqueueEvent(createCoreProductAutoCycleEvent({
        enabled: true,
        initialPosition: 0,
        playPhrases: durations.playPhrases,
        transitionPhrases: durations.transitionPhrases,
        revision: 0,
        preservePhase: true,
      }));
      appliedDurations = { ...durations };
    };

    const drainLifecycle = async (
      generation: number,
      operationSignal: AbortSignal,
    ): Promise<void> => {
      while (isCurrent(generation, operationSignal)) {
        const confirmed = installedProgram;
        const options = latestStartOptions;
        const candidate = pendingReplacement ?? (confirmed || !options ? null : {
          endpointA: options.endpointA,
          endpointB: options.endpointB,
        });
        if (!candidate) {
          flushDurations(generation, operationSignal);
          return;
        }
        pendingReplacement = null;

        const program = compileProductSceneProgram(
          createCoreProductSnapshot(candidate.endpointA),
          createCoreProductSnapshot(candidate.endpointB),
        );
        const expectedRevision = productSceneRevisionOnWire(program.revision);
        const programEvents = createCoreProductSceneProgramEvents(program);
        try {
          await productEngine.prepareSceneAssets(confirmed
            ? prepareStates([confirmed, candidate])
            : [candidate.endpointA, candidate.endpointB]);
        } catch (error) {
          if (!isCurrent(generation, operationSignal)) return;
          if (pendingReplacement) continue;
          if (!confirmed) throw error;

          // Asset admission replaces the requirement set before decoding. If
          // the union is not ready, restore only the confirmed pair before
          // reporting the existing failure. A newer pair always wins.
          let restoreError: unknown = null;
          try {
            await productEngine.prepareSceneAssets([confirmed.endpointA, confirmed.endpointB]);
          } catch (error) {
            restoreError = error;
          }
          if (!isCurrent(generation, operationSignal)) return;
          if (pendingReplacement) continue;
          throw restoreError ?? error;
        }
        if (!isCurrent(generation, operationSignal)) return;
        if (pendingReplacement) continue;

        const baselineTelemetry = productEngine.getTelemetry();
        const uploaded: UploadedProgram = {
          endpointA: candidate.endpointA,
          endpointB: candidate.endpointB,
          expectedRevision,
          baselineAbsoluteSampleTime: typeof baselineTelemetry?.absoluteSampleTime === 'number' &&
            Number.isFinite(baselineTelemetry.absoluteSampleTime)
            ? baselineTelemetry.absoluteSampleTime
            : null,
        };
        uploadedAwaitingAdoption = uploaded;
        const firstInstall = confirmed === null;
        if (firstInstall) {
          const durations = latestDurations ?? {
            playPhrases: options?.playPhrases ?? 1,
            transitionPhrases: options?.transitionPhrases ?? 1,
          };
          latestDurations = { ...durations };
          productEngine.enqueueEvents([
            ...programEvents,
            createCoreProductAutoCycleEvent({
              enabled: true,
              initialPosition: options?.initialPosition ?? 0,
              playPhrases: durations.playPhrases,
              transitionPhrases: durations.transitionPhrases,
              revision: expectedRevision,
            }),
          ]);
          appliedDurations = { ...durations };
        } else {
          productEngine.enqueueEvents(programEvents);
        }
        if (!isCurrent(generation, operationSignal)) return;
        if (!await waitForSceneProgramAdoption(uploaded, generation, operationSignal)) return;
        if (!isCurrent(generation, operationSignal)) return;

        installedProgram = {
          endpointA: candidate.endpointA,
          endpointB: candidate.endpointB,
          expectedRevision,
        };
        uploadedAwaitingAdoption = null;

        if (!firstInstall) {
          try {
            await productEngine.prepareSceneAssets([candidate.endpointA, candidate.endpointB]);
          } catch (error) {
            if (!isCurrent(generation, operationSignal)) return;
            if (pendingReplacement) continue;
            // Keep the old requirements if obsolete-asset release cannot be
            // admitted; the newly adopted program remains safe to play.
            let restoreError: unknown = null;
            try {
              await productEngine.prepareSceneAssets([
                confirmed!.endpointA,
                confirmed!.endpointB,
                candidate.endpointA,
                candidate.endpointB,
              ]);
            } catch (restoreFailure) {
              restoreError = restoreFailure;
            }
            if (!isCurrent(generation, operationSignal)) return;
            if (pendingReplacement) continue;
            throw restoreError ?? error;
          }
          if (!isCurrent(generation, operationSignal)) return;
        }

        flushDurations(generation, operationSignal);
        if (!isCurrent(generation, operationSignal)) return;
        if (!pendingReplacement) return;
      }
    };

    const enqueueLifecycleTransaction = (generation: number): Promise<void> => {
      const controller = new AbortController();
      transactionControllers.add(controller);
      const predecessor = transactionTail;
      const operation = predecessor.then(async () => {
        if (!isCurrent(generation, controller.signal)) return;
        await drainLifecycle(generation, controller.signal);
      }).finally(() => {
        transactionControllers.delete(controller);
        if (lifecycleTransaction === operation) lifecycleTransaction = null;
      });
      transactionTail = operation.catch(() => undefined);
      lifecycleTransaction = operation;
      return operation;
    };

    const start = (options: ProductAutoCycleStart): Promise<void> => {
      if (options.signal.aborted) return Promise.resolve();
      latestStartOptions = options;
      latestDurations = {
        playPhrases: options.playPhrases,
        transitionPhrases: options.transitionPhrases,
      };

      if (lifecycleActive && activeLifecycleSignal?.aborted) {
        cancelPendingAdoption();
        lifecycleActive = false;
        lifecycleGeneration += 1;
        activeLifecycleSignal = null;
      }
      if (!lifecycleActive) {
        lifecycleActive = true;
        lifecycleGeneration += 1;
        activeLifecycleSignal = options.signal;
        pendingReplacement = null;
        return enqueueLifecycleTransaction(lifecycleGeneration);
      }

      activeLifecycleSignal = options.signal;
      pendingReplacement = {
        endpointA: options.endpointA,
        endpointB: options.endpointB,
      };
      if (lifecycleTransaction) return lifecycleTransaction;
      return enqueueLifecycleTransaction(lifecycleGeneration);
    };

    const replace = (options: ProductAutoCycleEndpointPair): Promise<void> => {
      if (!lifecycleActive) return Promise.resolve();
      pendingReplacement = {
        endpointA: options.endpointA,
        endpointB: options.endpointB,
      };
      if (lifecycleTransaction) return lifecycleTransaction;
      return enqueueLifecycleTransaction(lifecycleGeneration);
    };

    const stop = (clearAssets: boolean): void => {
      const hadWork = lifecycleActive || installedProgram !== null || uploadedAwaitingAdoption !== null || lifecycleTransaction !== null;
      lifecycleActive = false;
      lifecycleGeneration += 1;
      const stopGeneration = lifecycleGeneration;
      activeLifecycleSignal = null;
      cancelPendingAdoption();
      pendingReplacement = null;
      latestStartOptions = null;
      installedProgram = null;
      uploadedAwaitingAdoption = null;
      for (const controller of transactionControllers) controller.abort();
      if (hadWork) {
        productEngine.enqueueEvent(createCoreProductAutoCycleEvent({
          enabled: false,
          initialPosition: 0,
          playPhrases: 1,
          transitionPhrases: 1,
          revision: 0,
        }));
      }
      if (clearAssets) {
        const tail = transactionTail;
        void tail.then(() => {
          if (!lifecycleActive && lifecycleGeneration === stopGeneration) productEngine.clearSceneAssets();
        });
      }
    };

    return {
      start,
      replace,
      stop,
      updateDurations(playPhrases, transitionPhrases) {
        latestDurations = { playPhrases, transitionPhrases };
        if (!lifecycleActive || !installedProgram || lifecycleTransaction) return;
        productEngine.enqueueEvent(createCoreProductAutoCycleEvent({
          enabled: true,
          initialPosition: 0,
          playPhrases,
          transitionPhrases,
          revision: 0,
          preservePhase: true,
        }));
        appliedDurations = { playPhrases, transitionPhrases };
      },
      readProjection() {
        const telemetry = productEngine.getTelemetry();
        settlePendingAdoption(telemetry);
        if (!telemetry) return null;
        const position = Math.max(0, Math.min(1, telemetry.scenePosition ?? telemetry.autoCyclePosition ?? 0));
        return {
          enabled: telemetry.autoCycleEnabled ?? false,
          position,
          phase: autoCyclePhaseLabel(telemetry.autoCyclePhase ?? 0, position),
          phaseEndFrame: telemetry.autoCyclePhaseEndFrame ?? telemetry.absoluteSampleTime ?? 0,
          absoluteSampleTime: telemetry.absoluteSampleTime ?? 0,
          phraseSeconds: telemetry.transportPhraseSeconds ?? null,
          sampleRate: typeof telemetry.sampleRate === 'number' && Number.isFinite(telemetry.sampleRate) && telemetry.sampleRate > 0
            ? telemetry.sampleRate
            : null,
          confirmedEndpointA: installedProgram?.endpointA ?? null,
          confirmedEndpointB: installedProgram?.endpointB ?? null,
        };
      },
    };
  }, []);

  useEffect(() => () => surface.stop(true), [surface]);
  return surface;
}
