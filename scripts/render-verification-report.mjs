#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const capabilityScorecardPath = resolve(
  process.cwd(),
  process.env.QINIU_CAPABILITY_SCORECARD_PATH || 'docs/capability-scorecard.md',
);
const capabilityEvidencePath = resolve(
  process.cwd(),
  process.env.QINIU_CAPABILITY_EVIDENCE_PATH || '.trellis/spec/sdk/capability-evidence.json',
);
const liveVerifySummaryPath = resolve(
  process.cwd(),
  process.env.QINIU_LIVE_VERIFY_SUMMARY_OUTPUT || 'artifacts/live-verify-gate.md',
);
const outputPath = resolve(
  process.cwd(),
  process.env.QINIU_VERIFICATION_REPORT_OUTPUT || 'artifacts/verification-report.md',
);
const reviewPacketPath = resolve(
  process.cwd(),
  process.env.QINIU_REVIEW_PACKET_OUTPUT || 'artifacts/review-packet.md',
);
const promotionDecisionsPath = resolve(
  process.cwd(),
  process.env.QINIU_PROMOTION_DECISIONS_OUTPUT || 'artifacts/promotion-decisions.md',
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
const capabilityEvidenceAvailable = existsSync(capabilityEvidencePath);
const capabilityEvidenceSummary = capabilityEvidenceAvailable
  ? (() => {
      const snapshot = JSON.parse(readFileSync(capabilityEvidencePath, 'utf8'));
      return [
        '# Capability Evidence Snapshot',
        '',
        `Generated at: ${snapshot.generatedAt ?? 'unknown'}`,
        `Tracked decision files: ${Array.isArray(snapshot.decisionFiles) ? snapshot.decisionFiles.length : 0}`,
        `Tracked promotion decisions: ${Array.isArray(snapshot.promotionDecisions) ? snapshot.promotionDecisions.length : 0}`,
        '',
      ].join('\n');
    })()
  : undefined;
const liveVerifyAvailable = existsSync(liveVerifySummaryPath);
const liveVerifySummary = liveVerifyAvailable ? readFileSync(liveVerifySummaryPath, 'utf8') : undefined;
const reviewPacketAvailable = existsSync(reviewPacketPath);
const reviewPacket = reviewPacketAvailable ? readFileSync(reviewPacketPath, 'utf8') : undefined;
const promotionDecisionsAvailable = existsSync(promotionDecisionsPath);
const promotionDecisions = promotionDecisionsAvailable
  ? readFileSync(promotionDecisionsPath, 'utf8')
  : undefined;

const rendered = renderVerificationReport({
  generatedAt: new Date().toISOString(),
  capabilityScorecard,
  capabilityEvidenceSummary,
  capabilityEvidenceAvailable,
  liveVerifySummary,
  liveVerifyAvailable,
  reviewPacket,
  reviewPacketAvailable,
  promotionDecisions,
  promotionDecisionsAvailable,
});

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, rendered, 'utf8');
console.log(`Wrote ${outputPath}`);
