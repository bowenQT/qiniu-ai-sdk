#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const inputPath = resolve(process.cwd(), process.argv[2] || process.env.QINIU_LIVE_VERIFY_OUTPUT || 'artifacts/live-verify-gate.json');
const outputPath = resolve(process.cwd(), process.argv[3] || process.env.QINIU_LIVE_VERIFY_SUMMARY_OUTPUT || 'artifacts/live-verify-gate.md');

if (!existsSync(inputPath)) {
  console.log(`Skipping live verification summary render. Missing input: ${inputPath}`);
  process.exit(0);
}

const distEntry = resolve(repoRoot, 'dist', 'cli', 'live-verify.mjs');
if (!existsSync(distEntry)) {
  throw new Error(`Missing build artifact: ${distEntry}. Run "npm run build" before rendering the live verification summary.`);
}

const { renderLiveVerifyGateMarkdown } = await import(pathToFileURL(distEntry).href);
const payload = JSON.parse(readFileSync(inputPath, 'utf8'));
const rendered = renderLiveVerifyGateMarkdown(payload);

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, rendered, 'utf8');
console.log(`Wrote ${outputPath}`);
