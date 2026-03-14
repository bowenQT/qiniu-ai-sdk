# Qiniu AI SDK

> v0.38.0 | Quick Index

## Must Read
- Governance entry: [`../AGENTS.md`](../AGENTS.md)
- Guides: [`../.trellis/spec/guides/index.md`](../.trellis/spec/guides/index.md)
- Verification: [`../.trellis/spec/sdk/verification-matrix.md`](../.trellis/spec/sdk/verification-matrix.md)

## Architecture

```
Qiniu AI SDK
|- API modules
|- Agentic layer
|- Integrations
`- Shared infrastructure
```

See [`../.trellis/spec/sdk/architecture.md`](../.trellis/spec/sdk/architecture.md)

## Module Boundaries
- Modules: [`../.trellis/spec/sdk/modules.md`](../.trellis/spec/sdk/modules.md)
- Runtime rules: [`../.trellis/spec/guides/agent-runtime.md`](../.trellis/spec/guides/agent-runtime.md)

## Environment Variables

| Variable | Purpose |
| --- | --- |
| `QINIU_API_KEY` | Required API key for SDK requests |
| `QINIU_ACCESS_KEY` | Optional signing access key for Kodo/Vframe/Sandbox |
| `QINIU_SECRET_KEY` | Optional signing secret for Kodo/Vframe/Sandbox |

## Development Commands

```bash
npm test
npm run test:coverage
npm run build
npm run clean && npm run build
```

## Notes
- Durable plans live in `../.trellis/plans/`.
- Shared SOPs live in `./workflows/`.
- Use `./workflows/multi-agent-product-evolution.md` for repo-wide lane-based upgrades.
- This file is an index; do not expand it back into a long-form knowledge base.
