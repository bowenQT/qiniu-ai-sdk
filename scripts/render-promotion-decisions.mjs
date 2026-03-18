#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const inputPath = process.argv[2] || process.env.QINIU_PROMOTION_DECISIONS_INPUT;
const capabilityEvidencePath = resolve(
  process.cwd(),
  process.env.QINIU_CAPABILITY_EVIDENCE_PATH || '.trellis/spec/sdk/capability-evidence.json',
);
const outputPath = resolve(
  process.cwd(),
  process.argv[3] || process.env.QINIU_PROMOTION_DECISIONS_OUTPUT || 'artifacts/promotion-decisions.md',
);
const packageWorkflowDistEntry = resolve(repoRoot, 'dist', 'cli', 'package-workflow.mjs');
const verificationReportDistEntry = resolve(repoRoot, 'dist', 'cli', 'verification-report.mjs');
if (!existsSync(packageWorkflowDistEntry) || !existsSync(verificationReportDistEntry)) {
  throw new Error(
    `Missing build artifacts. Run "npm run build" before rendering promotion decisions.`,
  );
}

const { renderPromotionDecisionSummary } = await import(pathToFileURL(verificationReportDistEntry).href);

let rendered;
if (inputPath) {
  const resolvedInputPath = resolve(process.cwd(), inputPath);
  if (existsSync(resolvedInputPath)) {
    const { renderPromotionDecisionMarkdown } = await import(pathToFileURL(packageWorkflowDistEntry).href);
    const payload = JSON.parse(readFileSync(resolvedInputPath, 'utf8'));
    rendered = renderPromotionDecisionMarkdown(payload);
  }
}

if (!rendered) {
  const capabilityEvidence = existsSync(capabilityEvidencePath)
    ? JSON.parse(readFileSync(capabilityEvidencePath, 'utf8'))
    : { promotionDecisions: [] };
  rendered = renderPromotionDecisionSummary(
    Array.isArray(capabilityEvidence.promotionDecisions) ? capabilityEvidence.promotionDecisions : [],
  );
}

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, rendered, 'utf8');
console.log(`Wrote ${outputPath}`);
