#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const enabled = process.env.QINIU_ENABLE_LIVE_VERIFY_GATE === '1';

if (!enabled) {
  console.log('Skipping live verification gate. Set QINIU_ENABLE_LIVE_VERIFY_GATE=1 to enable.');
  process.exit(0);
}

const lanes = process.env.QINIU_LIVE_VERIFY_GATE_LANES || 'cloud-surface,node-integrations,dx-validation';
const strict = process.env.QINIU_LIVE_VERIFY_GATE_STRICT !== '0';
const args = ['bin/qiniu-ai.mjs', 'verify', 'gate', '--lanes', lanes];

if (strict) {
  args.push('--strict');
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
