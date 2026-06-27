# KesshoCore Realtime-Safety Checklist

Product Core render code runs on the web AudioWorklet thread and native audio callbacks. Treat every render/process function as a hard realtime path unless it is explicitly setup, teardown, test-only, or offline tooling.

## Render-Thread Disallowed Operations

- Heap allocation or deallocation: `new`, `delete`, `malloc`, `calloc`, `realloc`, `free`.
- Container growth or string formatting: `push_back`, `emplace_back`, `resize`, `reserve`, `std::string`, streams, `snprintf`, `sprintf`.
- Locks and blocking synchronization: `std::mutex`, `std::lock_guard`, `std::unique_lock`, `std::condition_variable`.
- Filesystem, network, stdout, stderr, or platform logging.
- Exceptions escaping render code.
- JS, Swift, Objective-C, WebKit, or Capacitor bridge calls.
- Dynamic sample-rate dependent allocation inside the callback.

## Required Render-Thread Patterns

- Preallocate voices, events, buffers, delay lines, and scratch memory during setup or snapshot application.
- Use fixed-capacity event queues for MIDI, ProductEvent, sequencer, and live-note ingress.
- Use double-buffered parameter snapshots or immutable per-block state copied before rendering.
- Consume generated ProductEvent batches at block boundaries.
- Keep scalar denormal protection local to DSP hot paths where needed.
- Write diagnostics to fixed-size counters or telemetry structs and publish them off the render thread.

## Classification Rules

- Render path: `render`, `process*`, `mix*`, `tick*`, sequencer scheduling, voice generation, FX processing, and telemetry collection called from those paths.
- Setup path: constructors, `prepare`, `create`, `destroy`, snapshot loading, asset registration, tests, and offline tools.
- Ambiguous path: default to render-path restrictions until a benchmark or call graph proves otherwise.

## Verification

- `npm run core:product:realtime-safety` scans C++ render/process functions for disallowed operations.
- `npm run core:product:cpu` verifies render CPU budgets and missed quantum counts.
- `npm run core:product:cpu-scenarios` verifies CPU scenario budgets.
