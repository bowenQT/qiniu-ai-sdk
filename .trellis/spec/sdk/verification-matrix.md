# Verification Matrix

Use this matrix before claiming completion.

| Change Area | Minimum Verification |
| --- | --- |
| `.github/workflows/**`, `scripts/run-live-verify-gate.mjs`, `src/cli/live-verify.ts`, `.trellis/spec/sdk/live-verify-policy.json` | `npm test -- tests/cli/live-verify.test.ts tests/cli/live-verify-gate.test.ts`, `npm run build`, and a local `node scripts/run-live-verify-gate.mjs` smoke |
| `src/cli/package-workflow.ts`, `scripts/render-review-packet.mjs`, `scripts/render-promotion-decisions.mjs`, package-first workflow docs | `npm test -- tests/cli/package-workflow.test.ts tests/cli/verification-report.test.ts`, `npm run build`, and local render smoke for review/promotion artifacts |
| `.agent/**`, `.trellis/**`, `AGENTS.md`, `.claude/CLAUDE.md` | `git check-ignore -v` on tracked and ignored paths, `rg 'docs/plans/' .agent`, and manual link/path review |
| `package.json`, exports, `tsconfig*.json`, entrypoints | `npm run build` and `npm test` |
| `src/lib/**`, `src/core/**`, `src/adapter/**` | `npm test` and `npm run build` |
| `src/node/**`, MCP host/server, sandbox runtime | `npm test`, `npm run build`, and inspect relevant `tests/node/**` coverage |
| `src/modules/skills/**` | `npm test`, `npm run build`, and inspect relevant `tests/modules/skills` or `tests/unit/modules/**` coverage |
| README / COOKBOOK / CHANGELOG / governance docs | documentation consistency review plus any build/test needed by adjacent code changes |

## Governance Checks
- Remove stale `docs/plans/` references from tracked runtime assets.
- Ensure new durable plans live under `.trellis/plans/`.
- Ensure change-package briefs live under `.trellis/packages/`.
- Ensure phase stop and package-creation policy stay aligned with `.trellis/spec/sdk/phase-policy.json`.
- Ensure PR and nightly live-verify expectations stay aligned with `.trellis/spec/sdk/live-verify-policy.json`.
- Ensure `.agent/agent.md` remains an index rather than a long-form knowledge base.
