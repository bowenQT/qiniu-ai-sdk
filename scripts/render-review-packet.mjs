#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const briefPath = process.argv[2] || process.env.QINIU_CHANGE_PACKAGE_BRIEF;
const evidencePath = process.argv[3] || process.env.QINIU_CHANGE_PACKAGE_EVIDENCE;
const outputPath = resolve(
  process.cwd(),
  process.argv[4] || process.env.QINIU_REVIEW_PACKET_OUTPUT || 'artifacts/review-packet.md',
);

if (!briefPath || !evidencePath) {
  console.log('Skipping review packet render. Set QINIU_CHANGE_PACKAGE_BRIEF and QINIU_CHANGE_PACKAGE_EVIDENCE.');
  process.exit(0);
}

const resolvedBriefPath = resolve(process.cwd(), briefPath);
const resolvedEvidencePath = resolve(process.cwd(), evidencePath);
if (!existsSync(resolvedBriefPath) || !existsSync(resolvedEvidencePath)) {
  console.log(
    `Skipping review packet render. Missing input: ${!existsSync(resolvedBriefPath) ? resolvedBriefPath : resolvedEvidencePath}`,
  );
  process.exit(0);
}

const distEntry = resolve(repoRoot, 'dist', 'cli', 'package-workflow.mjs');
if (!existsSync(distEntry)) {
  throw new Error(`Missing build artifact: ${distEntry}. Run "npm run build" before rendering the review packet.`);
}

const {
  createReviewPacket,
  renderReviewPacketMarkdown,
} = await import(pathToFileURL(distEntry).href);
const changePackage = JSON.parse(readFileSync(resolvedBriefPath, 'utf8'));
const evidence = JSON.parse(readFileSync(resolvedEvidencePath, 'utf8'));
const packet = createReviewPacket(changePackage, evidence);
const rendered = renderReviewPacketMarkdown(changePackage, packet);

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, rendered, 'utf8');
console.log(`Wrote ${outputPath}`);
