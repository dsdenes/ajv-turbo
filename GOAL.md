## Objective

A drop-in replacement for ajv: a validator that an existing ajv-based project can adopt without changing its code, schemas, or configuration, and whose aggregated results in the benchmark suite published with ajv are at least 20% better than ajv's on the same machine.

Every acceptance result is measured on the current Node.js LTS line, Node.js 24.x, and the exact patch version used is recorded.

## Success criteria

- A project already using ajv switches to the replacement with no edits to its code, schemas, or configuration, and its behavior stays exactly as before.
- For the same schema and data, the replacement yields the same valid or invalid verdict and the same error report as ajv — across every schema dialect ajv supports, including schemas that use its format and keyword extensions, asynchronous validation, standalone validators, and custom extensions.
- Running ajv's published benchmark suite on one machine, with both validators measured under identical conditions on Node.js 24.x, shows an aggregate throughput at least 20% higher than ajv's. Aggregate throughput is the geometric mean of the per-case throughput ratios (replacement ops/sec ÷ ajv ops/sec) across the suite's cases, and must be at least 1.20.

## Measurement environment

- Runtime: Node.js 24.x, the latest LTS major. All acceptance checks — the drop-in switch, verdict and error-report equivalence, and the benchmark — run on Node.js 24.x; other Node.js versions are unverified and out of scope.
- Version reporting: the exact Node.js version (`process.versions.node`), benchmark suite version or commit, replacement commit, and machine details are recorded with every measurement.
- Runtime declaration: the package declares `engines` allowing Node.js 24 only (`^24`), a `.nvmrc` or `.node-version` selecting 24, and CI running the checks on Node.js 24.x.
- Benchmark conditions: the same machine, benchmark suite, schema and data fixtures, process settings, warm-up, and run procedure are used for both validators; results report per-case ops/sec, per-case ratios, and the geometric mean.
