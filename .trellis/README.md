# Trellis Governance

This directory stores durable repo knowledge for `qiniu_ai_sdk`.

## Source Of Truth Matrix

| Layer | Owns | Does Not Own |
| --- | --- | --- |
| Artifacts / CI | Task state, run evidence, temporary reports | Durable repo policy |
| `.trellis/spec/**` | Stable rules, architecture, verification guidance | Session-specific TODO state |
| `.trellis/plans/**` | Promoted plans worth keeping in repo history | Every transient artifact plan |
| `.agent/**` | Shared runtime workflows and curated skills | Long-form architecture reference |
| Ignored local state | Caches, local settings, personal overrides | Shared project rules |

## Folder Contract
- `spec/guides/`: cross-cutting rules and expectations.
- `spec/sdk/`: SDK-specific architecture, module boundaries, and verification.
- `plans/`: durable plans created or promoted for future contributors.
- `packages/`: tracked change-package briefs used by the package-first operating model.
- `integrations/`: runtime bridge documents such as Antigravity integration notes.
- `local/`: ignored cache or scratch state.
