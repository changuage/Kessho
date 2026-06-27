import {
  normalizeRoutingMuteGroupsState,
  ROUTING_MUTE_GROUP_STORAGE_KEY,
  type RoutingMuteGroupsState,
} from '../ui/routing';

export function loadRoutingMuteGroupsState(): RoutingMuteGroupsState {
  if (typeof window === 'undefined') return normalizeRoutingMuteGroupsState(undefined);
  try {
    return normalizeRoutingMuteGroupsState(JSON.parse(window.localStorage.getItem(ROUTING_MUTE_GROUP_STORAGE_KEY) ?? 'null'));
  } catch {
    return normalizeRoutingMuteGroupsState(undefined);
  }
}

export function saveRoutingMuteGroupsState(state: RoutingMuteGroupsState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ROUTING_MUTE_GROUP_STORAGE_KEY, JSON.stringify(normalizeRoutingMuteGroupsState(state)));
  } catch {
    // Storage failure should not block routing control.
  }
}
