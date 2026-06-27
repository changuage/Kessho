import {
  buildSampleLibraryRegistry,
  validateSampleLibraryRegistry,
} from './generate-sample-library-registry.mjs';

const { registry, diagnostics } = buildSampleLibraryRegistry();
validateSampleLibraryRegistry(registry);

const sampleCount = registry.reduce((total, library) => total + library.samples.length, 0);
console.log(`Sample asset id guard passed: ${registry.length} libraries, ${sampleCount} samples.`);
for (const diagnostic of diagnostics) {
  console.log(`- ${diagnostic}`);
}
