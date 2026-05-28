import { useEffect, type MutableRefObject } from 'react';
import { SHARED_PRESET_TEST_MODE } from '../presets/sharedMode';

type UsePresetPlatformMaintenanceOptions = {
  cloudEnabled: boolean;
  sonicParityMode: boolean;
  localPresetStoreOverride: boolean;
  cloudPresetStoreReadyPromiseRef: MutableRefObject<Promise<void>>;
};

export function usePresetPlatformMaintenance({
  cloudEnabled,
  sonicParityMode,
  localPresetStoreOverride,
  cloudPresetStoreReadyPromiseRef,
}: UsePresetPlatformMaintenanceOptions): void {
  useEffect(() => {
    if (!cloudEnabled || typeof window === 'undefined' || sonicParityMode || localPresetStoreOverride) return;

    const target = window as typeof window & {
      kesshoPresetV2Migration?: {
        run: (options?: unknown) => Promise<unknown>;
        optimizeStringWaves: (options?: unknown) => Promise<unknown>;
        repairChildGraphs: (options?: unknown) => Promise<unknown>;
        repairStringWavesGraph: (options?: unknown) => Promise<unknown>;
        verify: () => Promise<unknown>;
      };
    };

    target.kesshoPresetV2Migration = {
      run: async (options?: unknown) => {
        const { runPresetV2Migration } = await import('../presets');
        const report = await runPresetV2Migration(options as never);
        console.info(`[Preset V2 Migration] ${report.dryRun ? 'Dry run' : 'Write run'} complete.`);
        console.table(report.phases.map((phase) => ({
          phase: phase.phase,
          candidates: phase.candidates,
          [report.dryRun ? 'wouldWrite' : 'inserted']: report.dryRun ? phase.wouldWrite : phase.inserted,
          skippedExisting: phase.skippedExisting,
          skippedInvalid: phase.skippedInvalid,
          errors: phase.errors.length,
        })));
        if (report.phases.some((phase) => phase.errors.length > 0)) {
          console.warn('[Preset V2 Migration] Phase errors:', report.phases);
        }
        return report;
      },
      optimizeStringWaves: async (options?: unknown) => {
        const { optimizeStringWavesV2 } = await import('../presets');
        const report = await optimizeStringWavesV2(options as never);
        console.info(`[Preset V2 Migration] String Waves optimization ${report.dryRun ? 'dry run' : 'write run'} complete.`);
        console.table(report.childPresets);
        console.info('[Preset V2 Migration] String Waves latest ref count:', report.latestRefCount);
        return report;
      },
      repairChildGraphs: async (options?: unknown) => {
        const { repairPresetChildGraphsV2 } = await import('../presets');
        const report = await repairPresetChildGraphsV2(options as never);
        console.info(`[Preset V2 Migration] Child graph repair ${report.dryRun ? 'dry run' : 'write run'} complete.`);
        console.table(report.rows);
        if (report.errors.length) console.warn('[Preset V2 Migration] Child graph repair errors:', report.errors);
        return report;
      },
      repairStringWavesGraph: async (options?: unknown) => {
        const { repairStringWavesGraphV2 } = await import('../presets');
        const report = await repairStringWavesGraphV2(options as never);
        console.info(`[Preset V2 Migration] String Waves graph repair ${report.dryRun ? 'dry run' : 'write run'} complete.`);
        console.table(report.childPresets);
        console.table(report.states);
        return report;
      },
      verify: async () => {
        const { verifyPresetV2Migration } = await import('../presets');
        return verifyPresetV2Migration();
      },
    };

    return () => {
      delete target.kesshoPresetV2Migration;
    };
  }, [cloudEnabled, localPresetStoreOverride, sonicParityMode]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (SHARED_PRESET_TEST_MODE && cloudEnabled) {
        await cloudPresetStoreReadyPromiseRef.current;
        if (!cancelled) {
          console.log('Skipping bundled factory preset seeding; shared cloud presets are the source of truth.');
        }
        return;
      }
      if (cancelled) return;

      const { loadFactoryPresets } = await import('../presets');
      if (cancelled) return;

      const n = await loadFactoryPresets();
      if (!cancelled && n > 0) {
        console.log(`Seeded ${n} factory presets`);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cloudEnabled, cloudPresetStoreReadyPromiseRef]);
}
