# Kessho Product CPU And Heap Budget

Generated: 2026-05-13T12:01:15.932Z

Run command: `node scripts/check-kessho-product-cpu-budget.mjs`

Overall status: **PASS**

CPU status: **PASS**

Heap status: **PASS**

## CPU Budget

Render quantum: 2.666667 ms (128 frames at 48000 Hz)

| Scenario | Status | Avg CPU % | Peak CPU % | p95 ms | p99 ms | Simulated Underruns |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| disabledFx | PASS | 2.598110 | 47.839100 | 0.094564 | 0.118253 | 0 |
| activeFx | PASS | 6.740220 | 53.203100 | 0.217069 | 0.338799 | 0 |

## Heap And Asset Memory

| Field | Value | Budget |
| --- | ---: | ---: |
| WASM heap bytes | 225705984 | 402653184 |
| Base WASM heap bytes | 225705984 | 67108864 |
| Registered decoded asset bytes | 224738368 | 402653184 |

## Machine-Readable Pair

JSON: `docs/reports/kessho-product-cpu-budget-latest.json`
