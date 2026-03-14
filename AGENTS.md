# Repo Instructions

## Compatibility
- Codex reads this file directly.
- Claude Code imports this file via `.claude/CLAUDE.md`.
- Antigravity may read this file manually, but artifact state and runtime rules remain external.

## Source Of Truth
- Antigravity artifacts / CI artifacts own task state and run evidence.
- `.trellis/spec/**` owns durable repo knowledge and engineering rules.
- `.trellis/plans/**` owns promoted, reusable plans only.
- `.agent/workflows/**` and tracked `.agent/skills/**` own shared runtime SOPs.
- Local runtime state must stay out of the repo.

## Required Reads
- Before code edits, read `.trellis/spec/guides/index.md` and `.trellis/spec/sdk/verification-matrix.md`.
- Before documentation or release edits, read `.trellis/spec/guides/documentation.md`.
- If you change runtime guidance, skills, MCP behavior, sandbox behavior, approval behavior, or memory behavior, read `.trellis/spec/guides/agent-runtime.md`.

## Required Behavior
- Use `.agent/workflows/*.md` as the tracked SOP layer.
- Save durable design and implementation plans under `.trellis/plans/`.
- Do not create repo task state such as `.trellis/tasks/` or `.trellis/workspace/`.
- Do not treat ignored local skills or local runtime caches as part of the repo contract.
