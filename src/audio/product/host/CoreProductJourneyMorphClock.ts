type CoreProductJourneyMorphClockOptions = {
  hasCallback: () => boolean;
  invoke: (now: number) => void;
  isDocumentVisible: () => boolean;
  nowMs: () => number;
};

export class CoreProductJourneyMorphClock {
  private raf: number | null = null;
  private active = false;

  constructor(private readonly options: CoreProductJourneyMorphClockOptions) {}

  get running(): boolean {
    return this.active;
  }

  start(): boolean {
    if (this.active || !this.options.hasCallback()) return false;
    this.active = true;
    return true;
  }

  stop(): void {
    this.active = false;
    this.cancelTick();
  }

  syncAfterTelemetry(): void {
    if (!this.active || !this.options.hasCallback()) return;
    if (this.options.isDocumentVisible()) {
      if (this.raf === null) this.scheduleTick();
      return;
    }
    this.cancelTick();
  }

  scheduleTick(): void {
    if (!this.active || !this.options.hasCallback()) return;
    if (!this.options.isDocumentVisible()) {
      this.cancelTick();
      return;
    }

    const tick = (now: number) => {
      this.raf = null;
      if (!this.active || !this.options.hasCallback()) return;
      if (!this.options.isDocumentVisible()) return;

      this.options.invoke(now);
      if (!this.active || !this.options.hasCallback()) return;
      if (!this.options.isDocumentVisible()) return;

      this.raf = window.requestAnimationFrame(tick);
    };

    this.raf = window.requestAnimationFrame(tick);
  }

  private cancelTick(): void {
    if (this.raf !== null) {
      window.cancelAnimationFrame(this.raf);
      this.raf = null;
    }
  }
}
