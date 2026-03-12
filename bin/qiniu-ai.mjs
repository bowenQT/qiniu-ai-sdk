#!/usr/bin/env node
/**
 * Qiniu AI CLI — Skill management and SDK utilities.
 *
 * Usage:
 *   npx qiniu-ai skill list [--dir <skills-dir>]
 *   npx qiniu-ai skill verify [--fix] [--dir <skills-dir>]
 *   npx qiniu-ai skill remove <name> [--dir <skills-dir>]
 */

import { runCLI } from '../dist/cli/skill-cli.mjs';

runCLI(process.argv.slice(2));
