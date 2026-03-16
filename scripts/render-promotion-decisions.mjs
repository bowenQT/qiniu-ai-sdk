#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const inputPath = process.argv[2] || process.env.QINIU_PROMOTION_DECISIONS_INPUT;
const outputPath = resolve(
  process.cwd(),
  process.argv[3] || process.env.QINIU_PROMOTION_DECISIONS_OUTPUT || 'artifacts/promotion-decisions.md',
);

if (!inputPath) {
  console.log('Skipping promotion decision render. Set QINIU_PROMOTION_DECISIONS_INPUT.');
  process.exit(0);
}

const resolvedInputPath = resolve(process.cwd(), inputPath);
if (!existsSync(resolvedInputPath)) {
  console.log(`Skipping promotion decision render. Missing input: ${resolvedInputPath}`);
  process.exit(0);
}

const distEntry = resolve(repoRoot, 'dist', 'cli', 'package-workflow.mjs');
if (!existsSync(distEntry)) {
  throw new Error(`Missing build artifact: ${distEntry}. Run "npm run build" before rendering promotion decisions.`);
}

const { renderPromotionDecisionMarkdown } = await import(pathToFileURL(distEntry).href);
const payload = JSON.parse(readFileSync(resolvedInputPath, 'utf8'));
const rendered = renderPromotionDecisionMarkdown(payload);

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, rendered, 'utf8');
console.log(`Wrote ${outputPath}`);
