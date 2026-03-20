#!/usr/bin/env node

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const briefPath = process.argv[2] || process.env.QINIU_CHANGE_PACKAGE_BRIEF;
const evidencePath = process.argv[3] || process.env.QINIU_CHANGE_PACKAGE_EVIDENCE;
const handoffPath = process.env.QINIU_REVIEW_HANDOFF_PATH;
const outputPath = resolve(
  process.cwd(),
  process.argv[4] || process.env.QINIU_REVIEW_PACKET_OUTPUT || 'artifacts/review-packet.md',
);

function findLatestReviewHandoff(root, selectPreferredReviewHandoff) {
  const integrationsRoot = resolve(root, '.trellis', 'integrations');
  if (!existsSync(integrationsRoot)) {
    return undefined;
  }
  const candidates = readdirSync(integrationsRoot)
    .filter((entry) => entry.includes('review-handoff') && extname(entry) === '.md')
    .map((entry) => join(integrationsRoot, entry));
  return selectPreferredReviewHandoff(candidates);
}

function resolveOptionalPath(inputPath) {
  return inputPath ? resolve(process.cwd(), inputPath) : undefined;
}

const packageWorkflowDistEntry = resolve(repoRoot, 'dist', 'cli', 'package-workflow.mjs');
const verificationReportDistEntry = resolve(repoRoot, 'dist', 'cli', 'verification-report.mjs');
if (!existsSync(packageWorkflowDistEntry) || !existsSync(verificationReportDistEntry)) {
  throw new Error(
    `Missing build artifacts. Run "npm run build" before rendering the review packet.`,
  );
}

const { renderReviewPacketFallback, selectPreferredReviewHandoff } = await import(pathToFileURL(verificationReportDistEntry).href);

let rendered;
const resolvedBriefPath = resolveOptionalPath(briefPath);
const resolvedEvidencePath = resolveOptionalPath(evidencePath);

if (resolvedBriefPath && resolvedEvidencePath && existsSync(resolvedBriefPath) && existsSync(resolvedEvidencePath)) {
  const {
    createReviewPacket,
    renderReviewPacketMarkdown,
  } = await import(pathToFileURL(packageWorkflowDistEntry).href);
  const changePackage = JSON.parse(readFileSync(resolvedBriefPath, 'utf8'));
  const evidence = JSON.parse(readFileSync(resolvedEvidencePath, 'utf8'));
  const packet = createReviewPacket(changePackage, evidence);
  rendered = renderReviewPacketMarkdown(changePackage, packet);
} else {
  const resolvedHandoffPath = resolveOptionalPath(handoffPath) || findLatestReviewHandoff(process.cwd(), selectPreferredReviewHandoff);
  const handoffContent = resolvedHandoffPath && existsSync(resolvedHandoffPath)
    ? readFileSync(resolvedHandoffPath, 'utf8')
    : undefined;
  rendered = renderReviewPacketFallback({
    handoffPath: resolvedHandoffPath,
    handoffContent,
  });
}

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, rendered, 'utf8');
console.log(`Wrote ${outputPath}`);
