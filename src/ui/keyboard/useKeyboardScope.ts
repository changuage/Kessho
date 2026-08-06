import { useEffect, useRef } from 'react';

export type KeyboardScopeOptions = {
  readonly enabled?: boolean;
  readonly priority?: number;
  /** Focus-owned surfaces remain silent until they explicitly claim input. */
  readonly requiresClaim?: boolean;
  readonly onKeyDown?: (event: KeyboardEvent) => void;
  readonly onKeyUp?: (event: KeyboardEvent) => void;
  readonly onBlur?: () => void;
};

export type KeyboardScopeController = {
  claim: () => void;
  release: () => void;
  isActive: () => boolean;
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
let activeRegistrationId: number | null = null;

function refreshRegistrationOrder(): void {
  orderedRegistrations = Array.from(registrations.values()).sort((left, right) => (
    right.priority - left.priority || right.id - left.id
  ));
}

function dispatchKey(kind: 'onKeyDown' | 'onKeyUp', event: KeyboardEvent): void {
  if (activeRegistrationId !== null) {
    const registration = registrations.get(activeRegistrationId);
    if (registration) {
      const options = registration.options();
      if (options.enabled !== false) {
        options[kind]?.(event);
        // A claim gives the surface first refusal, not ownership of unrelated keys.
        if (event.defaultPrevented) return;
      }
    }
  }
  for (const registration of orderedRegistrations) {
    if (registration.id === activeRegistrationId) continue;
    const options = registration.options();
    if (options.enabled === false || options.requiresClaim) continue;
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
  activeRegistrationId = null;
}

function syncNativeListeners(): void {
  if (typeof window === 'undefined') return;
  const shouldListen = registrations.size > 0;
  if (shouldListen === listening) return;
  listening = shouldListen;
  if (shouldListen) {
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    window.addEventListener('blur', handleBlur);
  } else {
    window.removeEventListener('keydown', handleKeyDown, true);
    window.removeEventListener('keyup', handleKeyUp, true);
    window.removeEventListener('blur', handleBlur);
  }
}

export function useKeyboardScope(options: KeyboardScopeOptions): KeyboardScopeController {
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
      if (activeRegistrationId === id) {
        optionsRef.current.onBlur?.();
        activeRegistrationId = null;
      }
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

  const controllerRef = useRef<KeyboardScopeController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = {
      claim: () => {
        const registration = registrationRef.current;
        if (!registration || registration.options().enabled === false) return;
        if (activeRegistrationId === registration.id) return;
        const previous = activeRegistrationId === null ? null : registrations.get(activeRegistrationId);
        activeRegistrationId = registration.id;
        previous?.options().onBlur?.();
      },
      release: () => {
        const registration = registrationRef.current;
        if (registration && activeRegistrationId === registration.id) activeRegistrationId = null;
      },
      isActive: () => {
        const registration = registrationRef.current;
        return Boolean(registration && activeRegistrationId === registration.id && registration.options().enabled !== false);
      },
    };
  }
  return controllerRef.current;
}
