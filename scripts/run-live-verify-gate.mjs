#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const enabled = process.env.QINIU_ENABLE_LIVE_VERIFY_GATE === '1';

if (!enabled) {
  console.log('Skipping live verification gate. Set QINIU_ENABLE_LIVE_VERIFY_GATE=1 to enable.');
  process.exit(0);
}

const lanes = process.env.QINIU_LIVE_VERIFY_GATE_LANES || 'cloud-surface,node-integrations,dx-validation';
const strict = process.env.QINIU_LIVE_VERIFY_GATE_STRICT === '1';
const profile = process.env.QINIU_LIVE_VERIFY_PROFILE || 'pr';
const policyPath = process.env.QINIU_LIVE_VERIFY_POLICY_PATH;
const outputPath = process.env.QINIU_LIVE_VERIFY_OUTPUT;
const args = ['bin/qiniu-ai.mjs', 'verify', 'gate', '--lanes', lanes, '--profile', profile];

if (strict) {
  args.push('--strict');
}

if (policyPath) {
  args.push('--policy', policyPath);
}

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
