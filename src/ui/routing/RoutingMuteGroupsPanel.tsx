import { useEffect, useRef, useState, type CSSProperties } from 'react';
import DragNumber from '../drums/DragNumber';
import {
  isRoutingMuteGroupSlotStored,
  normalizeRoutingMuteGroupRandomSettings,
  normalizeRoutingMuteGroupPhraseRange,
  routingMuteGroupSlotPhraseRange,
  ROUTING_MUTE_GROUP_MAX_PHRASES,
  ROUTING_MUTE_GROUP_MIN_PHRASES,
  ROUTING_MUTE_GROUP_PHRASE_STEP,
  ROUTING_MUTE_GROUP_SLOT_COUNT,
  routingMuteGroupSlotColor,
  routingMuteGroupSlotActiveCount,
  routingMuteGroupSlotSeqSummaries,
  type RoutingMuteGroupPhraseRange,
  type RoutingMuteGroupRandomSettings,
  type RoutingMuteGroupRuntimeSnapshot,
  type RoutingMuteGroupsState,
  type RoutingMuteGroupSlot,
  type SaveSlotResult,
} from './routingMuteGroups';
import { ROUTING_SOURCE_REGISTRY } from './routingSourceRegistry';

type RoutingMuteGroupsPanelProps = {
  muteGroups: RoutingMuteGroupsState;
  activeSlotIndex: number | null;
  selectedSlotIndex: number;
  runtimeSnapshot: RoutingMuteGroupRuntimeSnapshot;
  onSelectSlot: (slotIndex: number) => void;
  onPressSlot: (slotIndex: number) => void;
  onSaveSlot: (slotIndex: number) => SaveSlotResult;
  onSaveSelectedSlot: () => SaveSlotResult;
  onClearSlot: (slotIndex: number) => void;
  onClearSelectedSlot: () => void;
  onUpdateSlotPhraseRange: (slotIndex: number, range: RoutingMuteGroupPhraseRange) => void;
  onUpdateRandomSettings: (patch: Partial<RoutingMuteGroupRandomSettings>) => void;
};

const LONG_PRESS_MS = 540;
const SAVE_FLASH_MS = 950;

type SaveFlashState = {
  slotIndex: number;
  kind: 'saved' | 'overwritten';
  nonce: number;
};

export default function RoutingMuteGroupsPanel({
  muteGroups,
  activeSlotIndex,
  selectedSlotIndex,
  runtimeSnapshot,
  onSelectSlot,
  onPressSlot,
  onSaveSlot,
  onSaveSelectedSlot,
  onClearSlot,
  onClearSelectedSlot,
  onUpdateSlotPhraseRange,
  onUpdateRandomSettings,
}: RoutingMuteGroupsPanelProps) {
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);
  const saveFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveFlash, setSaveFlash] = useState<SaveFlashState | null>(null);
  const [statusMessage, setStatusMessage] = useState('');

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const clearSaveFlashTimer = () => {
    if (saveFlashTimerRef.current) {
      clearTimeout(saveFlashTimerRef.current);
      saveFlashTimerRef.current = null;
    }
  };

  useEffect(() => () => {
    clearLongPressTimer();
    clearSaveFlashTimer();
  }, []);

  const flashSavedSlot = (result: SaveSlotResult) => {
    const nextFlash: SaveFlashState = {
      slotIndex: result.slotIndex,
      kind: result.wasStored ? 'overwritten' : 'saved',
      nonce: Date.now(),
    };
    clearSaveFlashTimer();
    setSaveFlash(nextFlash);
    setStatusMessage(
      result.wasStored
        ? `Overwrote mute group ${result.slotIndex + 1}`
        : `Saved mute group ${result.slotIndex + 1}`,
    );
    saveFlashTimerRef.current = setTimeout(() => {
      setSaveFlash((current) => (
        current?.slotIndex === nextFlash.slotIndex && current.nonce === nextFlash.nonce
          ? null
          : current
      ));
      saveFlashTimerRef.current = null;
    }, SAVE_FLASH_MS);
  };

  const clearExactSlot = (slotIndex: number) => {
    onClearSlot(slotIndex);
    setStatusMessage(`Cleared mute group ${slotIndex + 1}`);
  };

  const clearSelectedSlot = () => {
    onClearSelectedSlot();
    setStatusMessage(`Cleared mute group ${selectedSlotIndex + 1}`);
  };

  const randomSettings = normalizeRoutingMuteGroupRandomSettings(muteGroups.random);

  const handlePointerDown = (slotIndex: number) => {
    longPressFiredRef.current = false;
    clearLongPressTimer();
    longPressTimerRef.current = setTimeout(() => {
      longPressFiredRef.current = true;
      flashSavedSlot(onSaveSlot(slotIndex));
      navigator.vibrate?.(35);
    }, LONG_PRESS_MS);
  };

  const handlePointerEnd = () => {
    clearLongPressTimer();
  };

  const slotButtons = Array.from({ length: ROUTING_MUTE_GROUP_SLOT_COUNT }, (_, index) => {
    const slot = muteGroups.slots[index] ?? null;
    const stored = isRoutingMuteGroupSlotStored(slot);
    const active = activeSlotIndex === index;
    const selected = selectedSlotIndex === index;
    const slotColor = routingMuteGroupSlotColor(index, slot);
    const activeCount = routingMuteGroupSlotActiveCount(slot);
    const flashKind = saveFlash?.slotIndex === index ? saveFlash.kind : null;
    const slotClassName = [
      'routing-mute-slot',
      stored ? 'stored' : 'empty',
      active ? 'active' : '',
      selected ? 'selected' : '',
      flashKind === 'saved' ? 'just-saved' : '',
      flashKind === 'overwritten' ? 'overwritten' : '',
    ].filter(Boolean).join(' ');
    const label = `Mute group ${index + 1}`;
    const status = flashKind === 'saved'
      ? 'Saved'
      : flashKind === 'overwritten'
        ? 'Overwritten'
        : active
          ? 'Active'
          : stored
            ? `${activeCount} on`
            : 'Empty';

    return (
      <button
        key={index}
        type="button"
        className={slotClassName}
        style={{ '--mute-slot-color': slotColor } as CSSProperties}
        aria-label={`${label}. ${status}. ${selected ? 'Selected' : 'Inactive'}.`}
        aria-pressed={active}
        title={`${label}. Long press to save.`}
        onPointerDown={() => handlePointerDown(index)}
        onPointerUp={handlePointerEnd}
        onPointerLeave={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onClick={() => {
          if (longPressFiredRef.current) {
            longPressFiredRef.current = false;
            return;
          }
          onPressSlot(index);
        }}
        onFocus={() => onSelectSlot(index)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (event.shiftKey) {
              flashSavedSlot(onSaveSlot(index));
            } else {
              onPressSlot(index);
            }
          } else if (event.key === 's' || event.key === 'S') {
            event.preventDefault();
            flashSavedSlot(onSaveSlot(index));
          } else if (event.key === 'Delete' || event.key === 'Backspace') {
            event.preventDefault();
            clearExactSlot(index);
          }
        }}
      >
        <span className="routing-mute-slot-number">{index + 1}</span>
        <span className="routing-mute-slot-count">{status}</span>
      </button>
    );
  });

  const savedSlotCards = Array.from({ length: ROUTING_MUTE_GROUP_SLOT_COUNT }, (_, index) => {
    const slot = muteGroups.slots[index] ?? null;
    if (!isRoutingMuteGroupSlotStored(slot)) return null;
    const slotColor = routingMuteGroupSlotColor(index, slot);
    const activeCount = routingMuteGroupSlotActiveCount(slot);
    const range = routingMuteGroupSlotPhraseRange(slot, randomSettings);

    const updateRange = (patch: Partial<RoutingMuteGroupPhraseRange>) => {
      onUpdateSlotPhraseRange(index, normalizeRoutingMuteGroupPhraseRange({
        ...range,
        ...patch,
      }, range));
    };

    return (
      <div
        key={index}
        className={`routing-mute-card${activeSlotIndex === index ? ' active' : ''}`}
        style={{ '--mute-slot-color': slotColor } as CSSProperties}
      >
        <div className="routing-mute-card-head">
          <span className="routing-mute-card-num">{index + 1}</span>
          <span className="routing-mute-card-count">{activeCount} on</span>
        </div>
        <SourceDotStrip slot={slot} />
        {randomSettings.enabled && (
          <div className="routing-mute-card-range">
            <DragNumber
              value={range.min}
              min={ROUTING_MUTE_GROUP_MIN_PHRASES}
              max={ROUTING_MUTE_GROUP_MAX_PHRASES}
              step={ROUTING_MUTE_GROUP_PHRASE_STEP}
              label="Min"
              onChange={(v) => updateRange({ min: v })}
            />
            <DragNumber
              value={range.max}
              min={ROUTING_MUTE_GROUP_MIN_PHRASES}
              max={ROUTING_MUTE_GROUP_MAX_PHRASES}
              step={ROUTING_MUTE_GROUP_PHRASE_STEP}
              label="Max"
              onChange={(v) => updateRange({ max: v })}
            />
          </div>
        )}
      </div>
    );
  }).filter(Boolean);

  return (
    <div className="routing-mute-groups" aria-label="Mute groups">
      <div className="routing-mute-groups-head">
        <div className="routing-mute-groups-title">Mute Groups</div>
        <button
          type="button"
          className={`routing-mute-random-toggle${randomSettings.enabled ? ' active' : ''}`}
          onClick={() => onUpdateRandomSettings({ enabled: !randomSettings.enabled })}
          aria-pressed={randomSettings.enabled}
        >
          Random
        </button>
        {randomSettings.enabled && (
          <div className="routing-mute-random-controls">
            <span
              className="routing-mute-random-time"
              aria-label="Time before next random mute group change"
            >
              {formatCountdown(runtimeSnapshot.secondsToNextChange)}
            </span>
            {runtimeSnapshot.nextSlotIndex !== null && (
              <span className="routing-mute-random-next">
                → {runtimeSnapshot.nextSlotIndex + 1}
              </span>
            )}
            <DragNumber
              value={randomSettings.defaultMinPhrases}
              min={ROUTING_MUTE_GROUP_MIN_PHRASES}
              max={ROUTING_MUTE_GROUP_MAX_PHRASES}
              step={ROUTING_MUTE_GROUP_PHRASE_STEP}
              label="Min"
              onChange={(v) => onUpdateRandomSettings({ defaultMinPhrases: v })}
            />
            <DragNumber
              value={randomSettings.defaultMaxPhrases}
              min={ROUTING_MUTE_GROUP_MIN_PHRASES}
              max={ROUTING_MUTE_GROUP_MAX_PHRASES}
              step={ROUTING_MUTE_GROUP_PHRASE_STEP}
              label="Max"
              onChange={(v) => onUpdateRandomSettings({ defaultMaxPhrases: v })}
            />
            <DragNumber
              value={randomSettings.transitionPhrases}
              min={ROUTING_MUTE_GROUP_MIN_PHRASES}
              max={ROUTING_MUTE_GROUP_MAX_PHRASES}
              step={ROUTING_MUTE_GROUP_PHRASE_STEP}
              label="Xfade"
              onChange={(v) => onUpdateRandomSettings({ transitionPhrases: v })}
            />
          </div>
        )}
      </div>

      <div className="routing-mute-slots" role="group" aria-label="Mute group slots">
        {slotButtons}
      </div>

      {savedSlotCards.length > 0 && (
        <div className="routing-mute-cards">
          {savedSlotCards}
        </div>
      )}

      <div className="routing-mute-groups-actions">
        <button
          type="button"
          className="routing-mute-action"
          onClick={() => flashSavedSlot(onSaveSelectedSlot())}
          aria-label={`Save current mute scene into mute group ${selectedSlotIndex + 1}`}
          title={`Save current mute scene into slot ${selectedSlotIndex + 1}`}
        >
          Save Scene
        </button>
        <button
          type="button"
          className="routing-mute-action"
          onClick={clearSelectedSlot}
          aria-label={`Clear mute group ${selectedSlotIndex + 1}`}
          title={`Clear slot ${selectedSlotIndex + 1}`}
        >
          Clear
        </button>
      </div>

      <p className="routing-mute-groups-status" aria-live="polite">
        {statusMessage}
      </p>
    </div>
  );
}

const SOURCE_ABBREV: Record<string, string> = {
  pad1: 'Pd1', pad2: 'Pd2', lead1: 'Ld1', lead2: 'Ld2',
  sample1: 'Sm1', sample2: 'Sm2', drums: 'Drm', granular: 'Grn',
  waves: 'Wav', water: 'Wtr', insects: 'Ins', nature: 'Nat',
  delayAOut: 'DlA', delayBOut: 'DlB', degrade: 'Dgr', reverb: 'Rev',
};

function SourceDotStrip({ slot }: { slot: RoutingMuteGroupSlot }) {
  const mutedSet = new Set(slot.mutedSourceIds);
  const seqSummaries = routingMuteGroupSlotSeqSummaries(slot);
  const activeEngines = ROUTING_SOURCE_REGISTRY.filter((s) => !mutedSet.has(s.id));

  return (
    <div className="routing-mute-source-dots" aria-label="Engine mute summary">
      <div className="routing-mute-source-dots-row">
        {ROUTING_SOURCE_REGISTRY.map((source) => {
          const muted = mutedSet.has(source.id);
          return (
            <span
              key={source.id}
              className={`routing-mute-dot${muted ? ' muted' : ''}`}
              style={{ '--dot-color': source.accent } as CSSProperties}
              title={`${source.label}: ${muted ? 'muted' : 'on'}`}
            />
          );
        })}
      </div>
      <div className="routing-mute-active-labels">
        {activeEngines.map((source) => (
          <span
            key={source.id}
            className="routing-mute-active-tag"
            style={{ '--dot-color': source.accent } as CSSProperties}
          >
            {SOURCE_ABBREV[source.id] ?? source.id.slice(0, 3)}
          </span>
        ))}
      </div>
      {seqSummaries.length > 0 && (
        <div className="routing-mute-seq-summary">
          {seqSummaries.map((s) => (
            <span key={s.prefix} className="routing-mute-seq-badge">
              {s.label} {s.on}/{s.total}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function formatCountdown(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '--:--';
  const totalSeconds = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainder = totalSeconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}
