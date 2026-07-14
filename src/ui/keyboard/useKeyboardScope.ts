import { useEffect, useRef } from 'react';

export type KeyboardScopeOptions = {
  readonly enabled?: boolean;
  readonly priority?: number;
  readonly onKeyDown?: (event: KeyboardEvent) => void;
  readonly onKeyUp?: (event: KeyboardEvent) => void;
  readonly onBlur?: () => void;
};

type KeyboardScopeRegistration = {
  readonly id: number;
  readonly options: () => KeyboardScopeOptions;
  priority: number;
};

const registrations = new Map<number, KeyboardScopeRegistration>();
let orderedRegistrations: readonly KeyboardScopeRegistration[] = [];
let nextRegistrationId = 1;
let listening = false;

function refreshRegistrationOrder(): void {
  orderedRegistrations = Array.from(registrations.values()).sort((left, right) => (
    right.priority - left.priority || right.id - left.id
  ));
}

function dispatchKey(kind: 'onKeyDown' | 'onKeyUp', event: KeyboardEvent): void {
  for (const registration of orderedRegistrations) {
    const options = registration.options();
    if (options.enabled === false) continue;
    options[kind]?.(event);
    if (event.defaultPrevented) return;
  }
}

function handleKeyDown(event: KeyboardEvent): void {
  dispatchKey('onKeyDown', event);
}

function handleKeyUp(event: KeyboardEvent): void {
  dispatchKey('onKeyUp', event);
}

function handleBlur(): void {
  for (const registration of orderedRegistrations) {
    const options = registration.options();
    if (options.enabled !== false) options.onBlur?.();
  }
}

function syncNativeListeners(): void {
  if (typeof window === 'undefined') return;
  const shouldListen = registrations.size > 0;
  if (shouldListen === listening) return;
  listening = shouldListen;
  if (shouldListen) {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
  } else {
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
    window.removeEventListener('blur', handleBlur);
  }
}

export function useKeyboardScope(options: KeyboardScopeOptions): void {
  const optionsRef = useRef(options);
  const registrationRef = useRef<KeyboardScopeRegistration | null>(null);
  optionsRef.current = options;

  useEffect(() => {
    const id = nextRegistrationId;
    nextRegistrationId += 1;
    const registration: KeyboardScopeRegistration = {
      id,
      options: () => optionsRef.current,
      priority: optionsRef.current.priority ?? 0,
    };
    registrationRef.current = registration;
    registrations.set(id, registration);
    refreshRegistrationOrder();
    syncNativeListeners();
    return () => {
      registrations.delete(id);
      registrationRef.current = null;
      refreshRegistrationOrder();
      syncNativeListeners();
    };
  }, []);

  useEffect(() => {
    const registration = registrationRef.current;
    if (!registration) return;
    const priority = options.priority ?? 0;
    if (registration.priority === priority) return;
    registration.priority = priority;
    refreshRegistrationOrder();
  }, [options.priority]);
}
