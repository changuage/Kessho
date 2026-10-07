import {
  normalizeSynthSequenceVariationBank,
  type SynthSequenceVariationBank,
} from '../../../ui/sequencer/synthSequenceVariations';

export type CoreProductSynthSequenceVariationRuntimeBridge = {
  commitSynthSequenceVariationBank: (
    laneIndex: number,
    bank: SynthSequenceVariationBank | null,
  ) => Promise<boolean>;
};

function contentSignature(bank: SynthSequenceVariationBank | null): string | null {
  return bank === null ? null : JSON.stringify(bank);
}

function assertAccepted(accepted: boolean, laneIndex: number): void {
  if (accepted !== true) throw new Error(`Synth variation bank lane ${laneIndex} was not applied`);
}

/** Serializes bank transactions and keeps the last accepted target for replay. */
export class CoreProductSynthSequenceVariationSynchronizer {
  private readonly targets: Array<SynthSequenceVariationBank | null>;
  private readonly applied: Array<SynthSequenceVariationBank | null>;
  private readonly targetSignatures: Array<string | null>;
  private readonly appliedSignatures: Array<string | null>;
  private source: unknown = Symbol('uninitialized-synth-variation-banks');
  private sourceValues: readonly unknown[] | null = null;
  private operations: Promise<void> = Promise.resolve();

  constructor(private readonly laneCount: number) {
    if (!Number.isInteger(laneCount) || laneCount <= 0) throw new RangeError('Invalid synth variation lane count');
    this.targets = Array.from({ length: laneCount }, () => null);
    this.applied = Array.from({ length: laneCount }, () => null);
    this.targetSignatures = Array.from({ length: laneCount }, () => null);
    this.appliedSignatures = Array.from({ length: laneCount }, () => null);
  }

  setTargetsFromState(raw: unknown): void {
    if (raw === this.source) return;
    const values = raw === undefined || raw === null
      ? []
      : Array.isArray(raw) ? raw : (() => { throw new TypeError('Synth variation banks must be an array'); })();
    this.source = raw;
    for (let laneIndex = 0; laneIndex < this.laneCount; laneIndex += 1) {
      // State updates commonly replace the outer array while retaining the
      // unchanged bank objects. Keep those lanes on their existing normalized
      // signature; JSON serialization here is otherwise needless CPU work.
      if (this.sourceValues && this.sourceValues[laneIndex] === values[laneIndex]) continue;
      const bank = normalizeSynthSequenceVariationBank(values[laneIndex]);
      this.targets[laneIndex] = bank;
      this.targetSignatures[laneIndex] = contentSignature(bank);
    }
    this.sourceValues = values;
  }

  commit(
    laneIndex: number,
    bank: SynthSequenceVariationBank | null,
    runtime: () => CoreProductSynthSequenceVariationRuntimeBridge | null,
  ): Promise<boolean> {
    this.assertLane(laneIndex);
    const normalized = bank === null ? null : normalizeSynthSequenceVariationBank(bank);
    const previousTargetSignature = this.targetSignatures[laneIndex];
    const normalizedSignature = contentSignature(normalized);
    return this.enqueue(async () => {
      const bridge = runtime();
      if (!bridge) throw new Error('Product Core runtime is not ready for a synth variation commit');
      const accepted = await bridge.commitSynthSequenceVariationBank(laneIndex, normalized);
      assertAccepted(accepted, laneIndex);
      this.applied[laneIndex] = normalized;
      this.appliedSignatures[laneIndex] = normalizedSignature;
      if (this.targetSignatures[laneIndex] === previousTargetSignature) {
        this.targets[laneIndex] = normalized;
        this.targetSignatures[laneIndex] = normalizedSignature;
      }
      return accepted;
    });
  }

  sync(runtime: () => CoreProductSynthSequenceVariationRuntimeBridge | null): Promise<void> {
    return this.enqueue(() => this.syncNow(runtime));
  }

  replay(runtime: () => CoreProductSynthSequenceVariationRuntimeBridge | null): Promise<void> {
    return this.enqueue(async () => {
      await this.syncNow(runtime, true);
    });
  }

  private async syncNow(
    runtime: () => CoreProductSynthSequenceVariationRuntimeBridge | null,
    force = false,
  ): Promise<void> {
    const bridge = runtime();
    if (!bridge) return;
    for (let laneIndex = 0; laneIndex < this.laneCount; laneIndex += 1) {
      const bank = this.targets[laneIndex] ?? null;
      const signature = this.targetSignatures[laneIndex] ?? null;
      if ((!force && this.targetSignatures[laneIndex] === this.appliedSignatures[laneIndex]) ||
          (force && bank === null && this.appliedSignatures[laneIndex] === null)) continue;
      const accepted = await bridge.commitSynthSequenceVariationBank(laneIndex, bank);
      assertAccepted(accepted, laneIndex);
      this.applied[laneIndex] = bank;
      // The target can change while the bridge waits for an audio boundary.
      // Mark the bank that actually received the accepted receipt; a later
      // sync will submit the newer target.
      this.appliedSignatures[laneIndex] = signature;
    }
  }

  private assertLane(laneIndex: number): void {
    if (!Number.isInteger(laneIndex) || laneIndex < 0 || laneIndex >= this.laneCount) {
      throw new RangeError(`Invalid synth variation lane: ${laneIndex}`);
    }
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operations.then(operation, operation);
    this.operations = result.then(() => undefined, () => undefined);
    return result;
  }
}
