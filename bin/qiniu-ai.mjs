#!/usr/bin/env node
/**
 * Qiniu AI CLI — Skill management and SDK utilities.
 *
 * Usage:
 *   npx qiniu-ai init --template <chat|agent|node-agent>
 *   npx qiniu-ai doctor [--template <chat|agent|node-agent>] [--lane <name>]
 *   npx qiniu-ai worktree <init|spawn|status|integrate>
 *   npx qiniu-ai verify live --lane <name>
 *   npx qiniu-ai skill list [--dir <skills-dir>]
 *   npx qiniu-ai skill verify [--fix] [--dir <skills-dir>]
 *   npx qiniu-ai skill remove <name> [--dir <skills-dir>]
 */

import { fileURLToPath } from 'node:url';
import { runCLI } from '../dist/cli/skill-cli.mjs';

await runCLI(process.argv.slice(2), {
  packageRoot: fileURLToPath(new URL('..', import.meta.url)),
});
