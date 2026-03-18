# Change Packages

This directory stores tracked package briefs for bounded Phase 2 delivery.

## Contract

- One file per change package.
- File path pattern: `.trellis/packages/<phase>/<lane>-<topic>.json`
- `topic` must be slug-safe and match the package identifier.
- Package IDs use `phase/<lane>/<topic>`.
- Package branches are expected to use `codex/<phase>/<lane>/<topic>`.

## Lifecycle

1. Create the package brief with `qiniu-ai package init`.
2. Generate the evidence bundle with `qiniu-ai package evidence`.
3. Generate the review packet with `qiniu-ai package review`.
4. Record promotion decisions with `qiniu-ai package decision` when maturity changes are proposed.

Tracked package briefs are durable. Generated evidence lives in `artifacts/`.
