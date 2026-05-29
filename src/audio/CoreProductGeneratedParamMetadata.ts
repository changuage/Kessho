type GeneratedProductParamSpec = Readonly<{
  key: string;
  index: number;
}>;

export function generatedProductParamIndex(
  specs: readonly GeneratedProductParamSpec[],
  key: string,
): number {
  const spec = specs.find((candidate) => candidate.key === key);
  if (!spec) {
    throw new Error(`Generated Product param metadata is missing ${key}`);
  }
  return spec.index;
}
