#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const enabled = process.env.QINIU_ENABLE_EVAL_GATE === '1';

if (!enabled) {
  console.log('Skipping eval gate. Set QINIU_ENABLE_EVAL_GATE=1 to enable.');
  process.exit(0);
}

const baselinePath = process.env.QINIU_EVAL_BASELINE_PATH;
const candidatePath = process.env.QINIU_EVAL_CANDIDATE_PATH;
const outputPath = process.env.QINIU_EVAL_GATE_OUTPUT;

if (!baselinePath || !candidatePath) {
  console.error('QINIU_EVAL_BASELINE_PATH and QINIU_EVAL_CANDIDATE_PATH are required when eval gate is enabled.');
  process.exit(1);
}

const args = ['bin/qiniu-ai.mjs', 'verify', 'eval', '--baseline', baselinePath, '--candidate', candidatePath];

if (outputPath) {
  args.push('--out', outputPath, '--json');
}

const result = spawnSync('node', args, {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
