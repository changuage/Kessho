import { createCoreProductSequencerEvolveClock } from '../../CoreProductHostSequencerEvolve';

type CoreProductSequencerEvolveClock = ReturnType<typeof createCoreProductSequencerEvolveClock>;
type CoreProductSequencerEvolveTickInput = Parameters<CoreProductSequencerEvolveClock['tick']>[0];

export class CoreProductSequencerEvolveBridge {
  private readonly clock = createCoreProductSequencerEvolveClock();

  reset(): void {
    this.clock.reset();
  }

  tick(input: CoreProductSequencerEvolveTickInput): void {
    this.clock.tick(input);
  }
}
