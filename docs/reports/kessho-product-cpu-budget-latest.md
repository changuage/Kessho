# Kessho Product CPU And Heap Budget

Generated: 2026-05-14T11:51:38.223Z

Run command: `node scripts/check-kessho-product-cpu-budget.mjs`

Overall status: **PASS**

CPU status: **PASS**

Heap status: **PASS**

## CPU Budget

Render quantum: 2.666667 ms (128 frames at 48000 Hz)

| Scenario | Status | Avg CPU % | Peak CPU % | p95 ms | p99 ms | Simulated Underruns |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| disabledFx | PASS | 7.288600 | 13.087500 | 0.213000 | 0.235530 | 0 |
| activeFx | PASS | 10.764500 | 24.300000 | 0.345400 | 0.489590 | 0 |

## Heap And Asset Memory

| Field | Value | Budget |
| --- | ---: | ---: |
| WASM heap bytes | 225705984 | 402653184 |
| Base WASM heap bytes | 225705984 | 67108864 |
| Registered decoded asset bytes | 224738368 | 402653184 |

## Machine-Readable Pair

JSON: `docs/reports/kessho-product-cpu-budget-latest.json`
