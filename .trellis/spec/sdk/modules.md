# SDK Module Boundaries

## Public Entry Layers
- Root exports aggregate stable public APIs.
- `core` exposes agentic and runtime-neutral helpers.
- `node` exposes Node-only integrations such as MCP hosting.
- `adapter` exposes AI SDK compatibility helpers.
- `qiniu` and related module clients expose service-facing SDK functionality.

## Responsibility Boundaries

| Area | Owns | Avoid |
| --- | --- | --- |
| `src/lib/**` | shared request, tracing, schema, transport, and registry infrastructure | product-specific workflow rules |
| `src/ai/**` | orchestration, memory, approval, graph execution, checkpointers | low-level transport duplication |
| `src/modules/skills/**` | skill loading, validation, registry, install contract | repo governance docs |
| `src/modules/sandbox/**` | sandbox lifecycle, command/file access, templates | generic agent policy |
| `src/modules/mcp/**` + `src/node/**` | MCP server/client-host behavior and Node transport | browser-only assumptions |
| `src/adapter/**` | external adapter compatibility | SDK-internal policy docs |

## Governance Notes
- Repo workflows and prompts can reference these modules, but they do not define module behavior.
- If a change affects module boundaries, update this file and the verification matrix in the same change.
