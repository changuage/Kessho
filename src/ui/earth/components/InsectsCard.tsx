import { PresetRatingStars } from '../../../presets/PresetRatingStars';
import type { SliderState } from '../../state';
import {
  EarthCard,
  EarthDualSliderRenderer,
  EarthPresetOption,
  EarthPresetOptions,
} from './EarthControls';

type InsectsScope = 'insects1' | 'insects2';

type InsectsCardProps = {
  scope: InsectsScope;
  title: string;
  accent: string;
  selectedPreset: string;
  presetOptions: EarthPresetOption[];
  expandedCards: Set<string>;
  onToggleCard?: (id: string) => void;
  onPresetLoad: (scope: InsectsScope, value: string) => void;
  onPresetSave: (scope: InsectsScope) => void;
  onPresetRate?: (scope: InsectsScope, option: EarthPresetOption, rating: number) => void;
  ds: EarthDualSliderRenderer;
  enabled?: boolean;
  engineName?: string;
};

export function InsectsCard({
  scope,
  title,
  accent,
  selectedPreset,
  presetOptions,
  expandedCards,
  onToggleCard,
  onPresetLoad,
  onPresetSave,
  onPresetRate,
  ds,
  enabled,
  engineName,
}: InsectsCardProps) {
  const prefix = scope === 'insects1' ? 'insects' : 'insects2';
  const selectedOption = presetOptions.find(option => option.value === selectedPreset);

  return (
    <EarthCard
      cardId={scope}
      title={title}
      accent={accent}
      expandedCards={expandedCards}
      onToggleCard={onToggleCard}
      enabled={enabled}
      subtitle={engineName}
    >
      <div className="earth-preset-bar">
        <select
          className="earth-select earth-preset-select"
          value={selectedPreset}
          onChange={(e) => onPresetLoad(scope, e.target.value)}
        >
          <EarthPresetOptions options={presetOptions} />
        </select>
        {selectedOption && onPresetRate && (
          <PresetRatingStars
            value={selectedOption.rating ?? 0}
            onChange={(rating) => onPresetRate(scope, selectedOption, rating)}
            color={accent}
            size="0.55rem"
          />
        )}
        <button
          type="button"
          className="earth-preset-save"
          onClick={() => onPresetSave(scope)}
          title={`Save the current ${title} engine state as an L1 preset`}
        >
          Save
        </button>
      </div>

      {ds(`${prefix}Density` as keyof SliderState, 'Density', accentToFill(accent))}
      {ds(`${prefix}Temperature` as keyof SliderState, 'Temperature', accentToFill(accent))}
      {ds(`${prefix}Distance` as keyof SliderState, 'Distance', accentToFill(accent))}
      {ds(`${prefix}Proximity` as keyof SliderState, 'Proximity', accentToFill(accent))}
      {ds(`${prefix}Antiphony` as keyof SliderState, 'Antiphony', accentToFill(accent))}
      {ds(`${prefix}ClickRate` as keyof SliderState, 'Click Rate', accentToFill(accent))}
      {ds(`${prefix}Motion` as keyof SliderState, 'Motion', accentToFill(accent))}
    </EarthCard>
  );
}

function accentToFill(accent: string): string {
  if (accent === '#2ecc71') return 'rgba(46,204,113,0.5)';
  if (accent === '#27ae60') return 'rgba(39,174,96,0.5)';
  return accent;
}
