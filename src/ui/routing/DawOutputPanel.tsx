import React from 'react';
import {
  DAW_OUTPUT_CHANNEL_COUNT_OPTIONS,
  DAW_OUTPUT_MAX_CHANNELS,
  DAW_OUTPUT_SOURCE_DEFS,
  createDawOutputRoute,
  createDefaultDawOutputRoutesForSources,
  getDawOutputStereoPairOptions,
  isBlackHoleAudioDeviceLabel,
  sanitizeDawOutputRoutingConfig,
  type DawOutputDeviceSelection,
  type DawOutputRoute,
  type DawOutputRoutingConfig,
  type DawOutputSourceId,
} from '../../audio/dawOutputRouting';
import { SOURCE_COLORS } from '../../designSystem/colors';
import type { SliderState } from '../state';

type DawOutputSourceView = {
  sourceId: DawOutputSourceId;
  label: string;
  accent: string;
  active: (state: SliderState) => boolean;
};

export interface DawOutputPanelProps {
  state: SliderState;
  config: DawOutputRoutingConfig;
  deviceSelection: DawOutputDeviceSelection;
  onChange: (config: DawOutputRoutingConfig) => void;
  onDeviceSelectionChange: (selection: DawOutputDeviceSelection) => void;
}

type MediaDevicesWithOutputSelection = MediaDevices & {
  selectAudioOutput?: (options?: { deviceId?: string }) => Promise<MediaDeviceInfo>;
};

type AudioContextWithSinkId = AudioContext & {
  setSinkId?: (sinkId: string) => Promise<void>;
};

type WindowWithWebkitAudioContext = Window & {
  webkitAudioContext?: typeof AudioContext;
};

function getAudioContextConstructor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  return window.AudioContext ?? (window as WindowWithWebkitAudioContext).webkitAudioContext ?? null;
}

function canUseAudioOutputPicker(): boolean {
  if (typeof navigator === 'undefined') return false;
  const mediaDevices = navigator.mediaDevices as MediaDevicesWithOutputSelection | undefined;
  return typeof mediaDevices?.selectAudioOutput === 'function';
}

function canSetAudioContextSink(): boolean {
  const AudioContextCtor = getAudioContextConstructor();
  if (!AudioContextCtor) return false;
  return typeof (AudioContextCtor.prototype as { setSinkId?: unknown }).setSinkId === 'function';
}

function formatOutputDeviceLabel(device: MediaDeviceInfo, index: number): string {
  return device.label || `Audio Output ${index + 1}`;
}

function openBlackHoleInstaller(): void {
  window.open('https://github.com/ExistentialAudio/BlackHole', '_blank', 'noopener,noreferrer');
}

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function playDawOutputTestTone(leftChannel: number, sinkId: string): Promise<'selected' | 'system'> {
  const AudioContextCtor = getAudioContextConstructor();
  if (!AudioContextCtor) throw new Error('AudioContext is unavailable');
  const context = new AudioContextCtor({ latencyHint: 'interactive' });
  let routed = false;

  try {
    const contextWithSink = context as AudioContextWithSinkId;
    if (sinkId && typeof contextWithSink.setSinkId === 'function') {
      await contextWithSink.setSinkId(sinkId);
      routed = true;
    }

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const merger = context.createChannelMerger(DAW_OUTPUT_MAX_CHANNELS);
    const now = context.currentTime + 0.02;
    oscillator.type = 'sine';
    oscillator.frequency.value = 330 + leftChannel * 55;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.14, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);
    oscillator.connect(gain);
    gain.connect(merger, 0, leftChannel - 1);
    gain.connect(merger, 0, leftChannel);
    merger.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.36);
    await waitMs(430);
  } finally {
    if (context.state !== 'closed') {
      await context.close().catch(() => undefined);
    }
  }

  return routed ? 'selected' : 'system';
}

const SOURCE_ACCENTS: Record<DawOutputSourceId, string> = {
  pad1: SOURCE_COLORS.pad1,
  pad2: SOURCE_COLORS.pad2,
  lead1: SOURCE_COLORS.lead1,
  lead2: SOURCE_COLORS.lead2,
  piano: SOURCE_COLORS.piano,
  drums: SOURCE_COLORS.drums,
  granular: SOURCE_COLORS.granular,
  waves: SOURCE_COLORS.waves,
  water: SOURCE_COLORS.water,
  insects: SOURCE_COLORS.insects,
  nature: SOURCE_COLORS.nature,
  delayAOut: SOURCE_COLORS.delayA,
  delayBOut: SOURCE_COLORS.delayB,
  reverb: SOURCE_COLORS.reverb,
  dynamics: SOURCE_COLORS.dynamics,
};

const DAW_OUTPUT_SOURCES: DawOutputSourceView[] = DAW_OUTPUT_SOURCE_DEFS.map((source) => ({
  sourceId: source.sourceId,
  label: source.label,
  accent: SOURCE_ACCENTS[source.sourceId],
  active: (state: SliderState) => {
    switch (source.sourceId) {
      case 'pad1':
        return Boolean(state.padEnabled);
      case 'pad2':
        return Boolean(state.pad2Enabled);
      case 'lead1':
        return Boolean(state.leadEnabled);
      case 'lead2':
        return Boolean(state.lead2Enabled);
      case 'piano':
        return Boolean(state.pianoEnabled);
      case 'drums':
        return Boolean(state.drumEnabled);
      case 'granular':
        return Boolean(state.granularEnabled);
      case 'waves':
        return Boolean(state.oceanSampleEnabled);
      case 'water':
        return Boolean(state.waterEnabled);
      case 'insects':
        return Boolean(state.insectsEnabled || state.insects2Enabled);
      case 'nature':
        return Boolean(state.birdsEnabled || state.birds2Enabled || state.frogsEnabled);
      case 'delayAOut':
        return Boolean(state.delayAEnabled);
      case 'delayBOut':
        return Boolean(state.granularDelayEnabled);
      case 'reverb':
        return Boolean(state.reverbEnabled);
      case 'dynamics':
        return Boolean(state.dynamicsEnabled);
      default:
        return false;
    }
  },
}));

function pairLabel(channel: number): string {
  return `${channel} / ${channel + 1}`;
}

function routeBySource(routes: readonly DawOutputRoute[]): Map<DawOutputSourceId, DawOutputRoute> {
  return new Map(routes.map((route) => [route.sourceId, route]));
}

export default function DawOutputPanel({
  state,
  config,
  deviceSelection,
  onChange,
  onDeviceSelectionChange,
}: DawOutputPanelProps) {
  const [outputDevices, setOutputDevices] = React.useState<MediaDeviceInfo[]>([]);
  const [refreshingDevices, setRefreshingDevices] = React.useState(false);
  const [requestingDevice, setRequestingDevice] = React.useState(false);
  const [testingPair, setTestingPair] = React.useState<number | null>(null);
  const [setupMessage, setSetupMessage] = React.useState('');
  const sinkSupported = React.useMemo(() => canSetAudioContextSink(), []);
  const outputPickerSupported = React.useMemo(() => canUseAudioOutputPicker(), []);
  const sanitizedConfig = React.useMemo(() => sanitizeDawOutputRoutingConfig(config), [config]);
  const activeSources = React.useMemo(
    () => DAW_OUTPUT_SOURCES.filter((source) => source.active(state)),
    [state],
  );
  const activeSourceIds = React.useMemo(
    () => activeSources.map((source) => source.sourceId),
    [activeSources],
  );
  const activeSourceKey = activeSourceIds.join('|');
  const routeMap = React.useMemo(() => routeBySource(sanitizedConfig.routes), [sanitizedConfig.routes]);
  const pairOptions = React.useMemo(
    () => getDawOutputStereoPairOptions(sanitizedConfig.channelCount),
    [sanitizedConfig.channelCount],
  );
  const assignedByChannel = React.useMemo(() => {
    const assigned = new Map<number, DawOutputSourceId>();
    for (const route of sanitizedConfig.routes) {
      assigned.set(route.channel, route.sourceId);
    }
    return assigned;
  }, [sanitizedConfig.routes]);
  const selectedOutputDevice = React.useMemo(
    () => outputDevices.find((device) => device.deviceId === deviceSelection.deviceId) ?? null,
    [deviceSelection.deviceId, outputDevices],
  );
  const selectedOutputLabel = selectedOutputDevice?.label || deviceSelection.label;
  const labelsVisible = outputDevices.some((device) => device.label);
  const blackHoleDevice = outputDevices.find((device) => isBlackHoleAudioDeviceLabel(device.label));
  const blackHoleDetected = Boolean(blackHoleDevice || isBlackHoleAudioDeviceLabel(selectedOutputLabel));
  const blackHoleStatus = labelsVisible || selectedOutputLabel
    ? blackHoleDetected ? 'BlackHole Ready' : 'BlackHole Missing'
    : 'Labels Locked';
  const setupFallback = sinkSupported
    ? blackHoleDetected ? 'Choose BlackHole here, then arm matching stereo inputs in Logic.' : 'Install BlackHole, then refresh this list.'
    : 'Set macOS output to BlackHole; this browser cannot switch outputs directly.';

  const refreshOutputDevices = React.useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
      setSetupMessage('Audio device listing is unavailable.');
      return;
    }
    setRefreshingDevices(true);
    try {
      const devices = await Promise.race([
        navigator.mediaDevices.enumerateDevices(),
        waitMs(2500).then(() => null),
      ]);
      if (!devices) {
        setSetupMessage('Audio output scan timed out.');
        return;
      }
      const outputs = devices.filter((device) => device.kind === 'audiooutput');
      setOutputDevices(outputs);
      const selected = outputs.find((device) => device.deviceId === deviceSelection.deviceId);
      if (selected?.label && selected.label !== deviceSelection.label) {
        onDeviceSelectionChange({ deviceId: selected.deviceId, label: selected.label });
      }
      setSetupMessage(outputs.length > 0 ? 'Outputs refreshed.' : 'No audio outputs visible.');
    } catch (error) {
      console.warn('DAW output device enumeration failed:', error);
      setSetupMessage('Audio outputs unavailable.');
    } finally {
      setRefreshingDevices(false);
    }
  }, [deviceSelection.deviceId, deviceSelection.label, onDeviceSelectionChange]);

  React.useEffect(() => {
    const activeSet = new Set(activeSourceIds);
    const activeRoutes = sanitizedConfig.routes.filter((route) => activeSet.has(route.sourceId));
    if (activeRoutes.length !== sanitizedConfig.routes.length) {
      onChange({ ...sanitizedConfig, routes: activeRoutes });
    }
  }, [activeSourceKey, activeSourceIds, onChange, sanitizedConfig]);

  React.useEffect(() => {
    void refreshOutputDevices();
  }, [refreshOutputDevices]);

  const commitConfig = React.useCallback((nextConfig: DawOutputRoutingConfig) => {
    onChange(sanitizeDawOutputRoutingConfig(nextConfig));
  }, [onChange]);

  const setEnabled = React.useCallback((enabled: boolean) => {
    const routes = enabled && sanitizedConfig.routes.length === 0
      ? createDefaultDawOutputRoutesForSources(activeSourceIds, sanitizedConfig.channelCount)
      : sanitizedConfig.routes;
    commitConfig({ ...sanitizedConfig, enabled, routes });
  }, [activeSourceIds, commitConfig, sanitizedConfig]);

  const setChannelCount = React.useCallback((channelCount: number) => {
    commitConfig({ ...sanitizedConfig, channelCount });
  }, [commitConfig, sanitizedConfig]);

  const autoAssign = React.useCallback(() => {
    commitConfig({
      ...sanitizedConfig,
      enabled: true,
      routes: createDefaultDawOutputRoutesForSources(activeSourceIds, sanitizedConfig.channelCount),
    });
  }, [activeSourceIds, commitConfig, sanitizedConfig]);

  const setRouteChannel = React.useCallback((sourceId: DawOutputSourceId, channel: number) => {
    if (channel <= 0) {
      commitConfig({
        ...sanitizedConfig,
        routes: sanitizedConfig.routes.filter((route) => route.sourceId !== sourceId),
      });
      return;
    }

    const route = createDawOutputRoute(sourceId, channel);
    if (!route) return;
    const routes = [
      ...sanitizedConfig.routes.filter((existing) => (
        existing.sourceId !== sourceId && existing.channel !== channel
      )),
      route,
    ].sort((left, right) => activeSourceIds.indexOf(left.sourceId) - activeSourceIds.indexOf(right.sourceId));

    commitConfig({ ...sanitizedConfig, routes });
  }, [activeSourceIds, commitConfig, sanitizedConfig]);

  const chooseOutputDevice = React.useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
      setSetupMessage('Audio device permissions are unavailable.');
      return;
    }
    const mediaDevices = navigator.mediaDevices as MediaDevicesWithOutputSelection;
    setRequestingDevice(true);
    try {
      if (typeof mediaDevices.selectAudioOutput === 'function') {
        const selected = await mediaDevices.selectAudioOutput(
          deviceSelection.deviceId ? { deviceId: deviceSelection.deviceId } : undefined,
        );
        onDeviceSelectionChange({
          deviceId: selected.deviceId,
          label: selected.label || deviceSelection.label,
        });
        setSetupMessage(`Selected ${selected.label || 'audio output'}.`);
      } else if (typeof mediaDevices.getUserMedia === 'function') {
        const stream = await mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
        setSetupMessage('Audio output labels unlocked.');
      } else {
        setSetupMessage('Audio device permissions are unavailable.');
      }
      await refreshOutputDevices();
    } catch (error) {
      console.warn('DAW output device permission failed:', error);
      setSetupMessage('Output selection was not granted.');
    } finally {
      setRequestingDevice(false);
    }
  }, [deviceSelection.deviceId, deviceSelection.label, onDeviceSelectionChange, refreshOutputDevices]);

  const setSelectedOutputDevice = React.useCallback((deviceId: string) => {
    const device = outputDevices.find((outputDevice) => outputDevice.deviceId === deviceId);
    onDeviceSelectionChange({
      deviceId,
      label: device?.label ?? '',
    });
    setSetupMessage(deviceId ? `Selected ${device?.label || 'audio output'}.` : 'Using system output.');
  }, [onDeviceSelectionChange, outputDevices]);

  const playTestPair = React.useCallback(async (leftChannel: number) => {
    setTestingPair(leftChannel);
    try {
      const routed = await playDawOutputTestTone(leftChannel, sinkSupported ? deviceSelection.deviceId : '');
      const target = routed === 'selected' ? selectedOutputLabel || 'selected output' : 'system output';
      setSetupMessage(`Test ${pairLabel(leftChannel)} sent to ${target}.`);
    } catch (error) {
      console.warn('DAW output test tone failed:', error);
      setSetupMessage('Test tone failed.');
    } finally {
      setTestingPair(null);
    }
  }, [deviceSelection.deviceId, selectedOutputLabel, sinkSupported]);

  return (
    <section className="routing-card daw-output-card">
      <div className="routing-card-header daw-output-header">
        <span className="routing-card-title">DAW Output</span>
        <span className={`daw-output-status${sanitizedConfig.enabled ? ' active' : ''}`}>
          {sanitizedConfig.enabled ? 'On' : 'Off'}
        </span>
        <div className="daw-output-actions">
          <button
            type="button"
            className={sanitizedConfig.enabled ? 'active' : ''}
            onClick={() => setEnabled(!sanitizedConfig.enabled)}
          >
            {sanitizedConfig.enabled ? 'Output On' : 'Output Off'}
          </button>
          <label className="daw-output-channel-select">
            <span>Channels</span>
            <select
              value={sanitizedConfig.channelCount}
              onChange={(event) => setChannelCount(Number(event.currentTarget.value))}
            >
              {DAW_OUTPUT_CHANNEL_COUNT_OPTIONS.map((channelCount) => (
                <option key={channelCount} value={channelCount}>{channelCount}</option>
              ))}
            </select>
          </label>
          <button type="button" onClick={autoAssign} disabled={activeSourceIds.length === 0}>
            Auto
          </button>
        </div>
      </div>

      <div className="routing-card-body daw-output-body">
        <div className="daw-output-setup">
          <div className="daw-output-setup-top">
            <div className="daw-output-setup-title">
              <span>DAW Setup</span>
              <small>{selectedOutputLabel || 'System Output'}</small>
            </div>
            <div className="daw-output-setup-statuses">
              <span className={`daw-output-pill${blackHoleDetected ? ' ready' : labelsVisible ? ' warning' : ''}`}>
                {blackHoleStatus}
              </span>
              <span className={`daw-output-pill${sinkSupported ? ' ready' : ''}`}>
                {sinkSupported ? 'Direct Output' : 'System Output'}
              </span>
            </div>
          </div>

          <div className="daw-output-setup-controls">
            <label className="daw-output-device-select">
              <span>Output</span>
              <select
                value={sinkSupported ? deviceSelection.deviceId : ''}
                disabled={!sinkSupported}
                onChange={(event) => setSelectedOutputDevice(event.currentTarget.value)}
              >
                <option value="">System Output</option>
                {outputDevices.map((device, index) => (
                  <option key={`${device.deviceId}-${index}`} value={device.deviceId}>
                    {formatOutputDeviceLabel(device, index)}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={refreshOutputDevices} disabled={refreshingDevices}>
              {refreshingDevices ? 'Scanning' : 'Refresh'}
            </button>
            <button type="button" onClick={chooseOutputDevice} disabled={requestingDevice}>
              {requestingDevice ? 'Waiting' : outputPickerSupported ? 'Choose' : 'Labels'}
            </button>
            <button type="button" onClick={openBlackHoleInstaller}>
              BlackHole
            </button>
          </div>

          <div className="daw-output-test-row">
            <span>Test</span>
            {[1, 3, 5].map((leftChannel) => (
              <button
                key={leftChannel}
                type="button"
                disabled={testingPair !== null || leftChannel + 1 > sanitizedConfig.channelCount}
                onClick={() => playTestPair(leftChannel)}
              >
                {testingPair === leftChannel ? 'Playing' : pairLabel(leftChannel)}
              </button>
            ))}
          </div>

          <div className="daw-output-setup-note">{setupMessage || setupFallback}</div>
        </div>

        <div className="daw-output-row fixed">
          <div className="daw-output-source">
            <span className="daw-output-dot mix" />
            <span>Mix</span>
          </div>
          <span className="daw-output-pair">1 / 2</span>
        </div>

        {activeSources.length === 0 ? (
          <div className="daw-output-empty">No active engines</div>
        ) : activeSources.map((source) => {
          const route = routeMap.get(source.sourceId);
          return (
            <div
              key={source.sourceId}
              className="daw-output-row"
              style={{ '--row-accent': source.accent } as React.CSSProperties}
            >
              <div className="daw-output-source">
                <span className="daw-output-dot" />
                <span>{source.label}</span>
              </div>
              <select
                value={route?.channel ?? 0}
                disabled={!sanitizedConfig.enabled}
                onChange={(event) => setRouteChannel(source.sourceId, Number(event.currentTarget.value))}
                aria-label={`${source.label} DAW output pair`}
              >
                <option value={0}>Off</option>
                {pairOptions.map((channel) => {
                  const assignedSource = assignedByChannel.get(channel);
                  const assignedElsewhere = Boolean(assignedSource && assignedSource !== source.sourceId);
                  return (
                    <option key={channel} value={channel} disabled={assignedElsewhere}>
                      {pairLabel(channel)}
                    </option>
                  );
                })}
              </select>
            </div>
          );
        })}
      </div>
    </section>
  );
}
