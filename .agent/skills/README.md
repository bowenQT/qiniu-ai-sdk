# Project Skill Contract

This repository tracks a curated subset of `.agent/skills/**`.

- Tracked skills are shared runtime assets required for workflow portability or repo-specific debugging.
- Curated skill directories are versioned recursively on purpose. Some skills rely on sibling references, examples, or scripts.
- If a tracked skill overlaps with a shared skill, keep the shared layer as the semantic source of truth and keep the tracked copy either synchronized or explicitly repo-specific.
- Current synchronized shared-skill copies: `systematic-debugging`, `verification-before-completion`.
- Any non-whitelisted skill remains local/runtime-specific and is not part of the repository contract.
- New skills are ignored by default until they are explicitly whitelisted in `.gitignore`.
