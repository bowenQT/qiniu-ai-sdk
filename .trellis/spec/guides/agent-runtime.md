# Agent Runtime Guide

## Shared Runtime Assets
- Tracked `.agent/workflows/**` are the repository's shared SOP layer.
- Tracked `.agent/skills/**` are a curated runtime subset required for workflow portability or repo-specific debugging.
- Non-whitelisted skills remain local-only and are not a stable repo interface.

## When To Update Runtime Guidance
- Update tracked workflows if command paths, plan locations, or completion gates change.
- Update tracked skills if workflow dependencies or repo-specific debugging references change.
- Update `.agent/agent.md` whenever its index links or minimal command/env guidance changes.

## Runtime Features To Treat Carefully
- MCP behavior, sandbox behavior, approval flow, checkpointing, and memory handling are developer-facing runtime capabilities.
- When these behaviors change, update `.trellis/spec/sdk/architecture.md` or `.trellis/spec/sdk/modules.md` first, then adjust SOPs if needed.
