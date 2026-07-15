import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isDocumentVisible,
  subscribeToDocumentVisibility,
} from './useDocumentVisibility';

test('document visibility store fans out through one browser listener', () => {
  const originalDocument = globalThis.document;
  const browserListeners = new Set<() => void>();
  let addCount = 0;
  let removeCount = 0;
  let visibilityState: DocumentVisibilityState = 'visible';
  const documentStub = {
    get visibilityState() { return visibilityState; },
    addEventListener(type: string, listener: () => void) {
      if (type === 'visibilitychange') {
        addCount += 1;
        browserListeners.add(listener);
      }
    },
    removeEventListener(type: string, listener: () => void) {
      if (type === 'visibilitychange') {
        removeCount += 1;
        browserListeners.delete(listener);
      }
    },
  } as unknown as Document;
  Object.defineProperty(globalThis, 'document', { configurable: true, value: documentStub });

  try {
    let firstUpdates = 0;
    let secondUpdates = 0;
    const unsubscribeFirst = subscribeToDocumentVisibility(() => { firstUpdates += 1; });
    const unsubscribeSecond = subscribeToDocumentVisibility(() => { secondUpdates += 1; });

    assert.equal(addCount, 1);
    assert.equal(isDocumentVisible(), true);
    visibilityState = 'hidden';
    for (const listener of browserListeners) listener();
    assert.equal(isDocumentVisible(), false);
    assert.equal(firstUpdates, 1);
    assert.equal(secondUpdates, 1);

    unsubscribeFirst();
    assert.equal(removeCount, 0);
    unsubscribeSecond();
    assert.equal(removeCount, 1);
    assert.equal(browserListeners.size, 0);
  } finally {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument });
  }
});
