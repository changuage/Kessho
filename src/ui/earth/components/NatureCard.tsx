import type { SliderState } from '../../state';
import { EarthCard, type EarthDualSliderRenderer } from './EarthControls';

type NatureCardProps = {
  cardId: string;
  title: string;
  accent: string;
  enabledKey: keyof SliderState;
  levelKey: keyof SliderState;
  sliceDurationKey: keyof SliderState;
  sliceDensityKey: keyof SliderState;
  state: SliderState;
  ds: EarthDualSliderRenderer;
  expandedCards: Set<string>;
  onToggleCard?: (id: string) => void;
  onSelectChange: <K extends keyof SliderState>(key: K, value: SliderState[K]) => void;
  enabled?: boolean;
};

export function NatureCard({
  cardId,
  title,
  accent,
  enabledKey,
  levelKey,
  sliceDurationKey,
  sliceDensityKey,
  state,
  ds,
  expandedCards,
  onToggleCard,
  onSelectChange,
  enabled,
}: NatureCardProps) {
  const isEnabled = Boolean(state[enabledKey]);

  return (
    <EarthCard
      cardId={cardId}
      title={title}
      accent={accent}
      expandedCards={expandedCards}
      onToggleCard={onToggleCard}
      enabled={enabled}
      onToggleEnabled={() => onSelectChange(enabledKey, (!isEnabled) as SliderState[typeof enabledKey])}
      enableTitle={isEnabled ? `Disable ${title}` : `Enable ${title}`}
    >
      {ds(levelKey, 'Level', `${accent}88`)}
      {ds(sliceDurationKey, 'Slice Duration', `${accent}55`, {
        format: (v) => `${v.toFixed(1)} s`,
      })}
      {ds(sliceDensityKey, 'Slice Density', `${accent}44`)}
    </EarthCard>
  );
}
