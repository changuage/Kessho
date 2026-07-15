import {
  getStateValueFromSliderNumber,
  quantize,
  type SliderState,
} from '../ui/state';

export type ParameterDomain = 'synth' | 'fx' | 'drum' | 'routing' | 'visualizer';

type DomainParameterCommand<Domain extends ParameterDomain> = {
  readonly domain: Domain;
  readonly key: keyof SliderState;
  readonly sliderValue: number | string;
  readonly stateValue: SliderState[keyof SliderState] | string;
};

export type ParameterCommand =
  | DomainParameterCommand<'synth'>
  | DomainParameterCommand<'fx'>
  | DomainParameterCommand<'drum'>
  | DomainParameterCommand<'routing'>
  | DomainParameterCommand<'visualizer'>;

/** Quantization is deliberately centralized at the command boundary. */
export function createParameterCommand(
  domain: ParameterDomain,
  key: keyof SliderState,
  value: number | string,
): ParameterCommand {
  if (typeof value !== 'number') {
    return { domain, key, sliderValue: value, stateValue: value } as ParameterCommand;
  }
  const sliderValue = quantize(key, value);
  return {
    domain,
    key,
    sliderValue,
    stateValue: getStateValueFromSliderNumber(key, sliderValue),
  } as ParameterCommand;
}
