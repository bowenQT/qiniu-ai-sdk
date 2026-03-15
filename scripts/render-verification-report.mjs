#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const capabilityScorecardPath = resolve(
  process.cwd(),
  process.env.QINIU_CAPABILITY_SCORECARD_PATH || 'docs/capability-scorecard.md',
);
const liveVerifySummaryPath = resolve(
  process.cwd(),
  process.env.QINIU_LIVE_VERIFY_SUMMARY_OUTPUT || 'artifacts/live-verify-gate.md',
);
const outputPath = resolve(
  process.cwd(),
  process.env.QINIU_VERIFICATION_REPORT_OUTPUT || 'artifacts/verification-report.md',
);

if (!existsSync(capabilityScorecardPath)) {
  throw new Error(`Missing capability scorecard: ${capabilityScorecardPath}`);
}

const distEntry = resolve(repoRoot, 'dist', 'cli', 'verification-report.mjs');
if (!existsSync(distEntry)) {
  throw new Error(`Missing build artifact: ${distEntry}. Run "npm run build" before rendering the verification report.`);
}

const { renderVerificationReport } = await import(pathToFileURL(distEntry).href);
const capabilityScorecard = readFileSync(capabilityScorecardPath, 'utf8');
const liveVerifyAvailable = existsSync(liveVerifySummaryPath);
const liveVerifySummary = liveVerifyAvailable ? readFileSync(liveVerifySummaryPath, 'utf8') : undefined;

const rendered = renderVerificationReport({
  generatedAt: new Date().toISOString(),
  capabilityScorecard,
  liveVerifySummary,
  liveVerifyAvailable,
});

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, rendered, 'utf8');
console.log(`Wrote ${outputPath}`);
