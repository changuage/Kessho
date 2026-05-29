export class CoreProductDisplayCallbackRegistry {
  private readonly callbacks = new Map<string, unknown>();

  has(name: string): boolean {
    return this.callbacks.has(name);
  }

  setCallback(name: string, callback: unknown): void {
    if (typeof callback === 'function') {
      this.callbacks.set(name, callback);
      return;
    }
    this.callbacks.delete(name);
  }

  setValue(name: string, value: unknown): void {
    this.callbacks.set(name, value);
  }

  invoke(name: string, ...args: unknown[]): void {
    const callback = this.callbacks.get(name);
    if (typeof callback === 'function') {
      (callback as (...invokeArgs: unknown[]) => void)(...args);
    }
  }
}
