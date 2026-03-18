#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const capabilityScorecardPath = resolve(
  process.cwd(),
  process.env.QINIU_CAPABILITY_SCORECARD_PATH || 'docs/capability-scorecard.md',
);
const phasePolicyPath = resolve(
  process.cwd(),
  process.env.QINIU_PHASE_POLICY_PATH || '.trellis/spec/sdk/phase-policy.json',
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
const finalPromotionGateSummaryPath = resolve(
  process.cwd(),
  process.env.QINIU_FINAL_PROMOTION_GATE_SUMMARY_OUTPUT || 'artifacts/final-promotion-gate.md',
);

if (!existsSync(capabilityScorecardPath)) {
  throw new Error(`Missing capability scorecard: ${capabilityScorecardPath}`);
}

const distEntry = resolve(repoRoot, 'dist', 'cli', 'verification-report.mjs');
if (!existsSync(distEntry)) {
  throw new Error(`Missing build artifact: ${distEntry}. Run "npm run build" before rendering the verification report.`);
}

const {
  renderCapabilityEvidenceSummary,
  renderPromotionGateSummary,
  renderVerificationReport,
} = await import(pathToFileURL(distEntry).href);

function comparePhaseNames(left, right) {
  const leftNumber = Number.parseInt(String(left).replace(/^phase/, ''), 10);
  const rightNumber = Number.parseInt(String(right).replace(/^phase/, ''), 10);
  if (!Number.isNaN(leftNumber) && !Number.isNaN(rightNumber) && leftNumber !== rightNumber) {
    return leftNumber - rightNumber;
  }
  return String(left).localeCompare(String(right));
}

function resolvePhasePolicyEntry(phases) {
  const entries = Object.entries(phases ?? {})
    .filter((entry) => Boolean(entry[1]))
    .sort(([left], [right]) => comparePhaseNames(left, right));
  if (entries.length === 0) {
    return undefined;
  }
  return [...entries].reverse().find(([, entry]) => entry.status !== 'closed') ?? entries[entries.length - 1];
}

const capabilityScorecard = readFileSync(capabilityScorecardPath, 'utf8');
const phasePolicyAvailable = existsSync(phasePolicyPath);
const phasePolicySummary = phasePolicyAvailable
  ? (() => {
      const payload = JSON.parse(readFileSync(phasePolicyPath, 'utf8'));
      const resolved = resolvePhasePolicyEntry(payload?.phases);
      if (!resolved) {
        return '# Phase Policy\n\nTracked phase policy entry was not found.\n';
      }
      const [phaseName, entry] = resolved;
      return [
        '# Phase Policy',
        '',
        `- Phase: ${phaseName}`,
        `- Status: ${entry.status ?? 'unknown'}`,
        `- New packages allowed: ${entry.allowNewPackages ? 'yes' : 'no'}`,
        ...(entry.closeoutReportPath ? [`- Closeout report: ${entry.closeoutReportPath}`] : []),
        ...(Array.isArray(entry.closeoutCriteria) ? [`- Closeout criteria: ${entry.closeoutCriteria.length}`] : []),
        ...(Array.isArray(entry.overrideRules) ? [`- Override rules: ${entry.overrideRules.length}`] : []),
        '',
      ].join('\n');
    })()
  : undefined;
const capabilityEvidenceAvailable = existsSync(capabilityEvidencePath);
const capabilityEvidenceSummary = capabilityEvidenceAvailable
  ? (() => {
      const snapshot = JSON.parse(readFileSync(capabilityEvidencePath, 'utf8'));
      return renderCapabilityEvidenceSummary(snapshot);
    })()
  : undefined;
const promotionGateSummary = capabilityEvidenceAvailable
  ? (() => {
      const snapshot = JSON.parse(readFileSync(capabilityEvidencePath, 'utf8'));
      const latestGate = snapshot.latestLiveVerifyGate && typeof snapshot.latestLiveVerifyGate === 'object'
        ? snapshot.latestLiveVerifyGate
        : undefined;
      return renderPromotionGateSummary(
        latestGate?.promotionGateStatus
          ? {
              status: latestGate.promotionGateStatus,
              packageId: latestGate.packageId,
              policyProfile: latestGate.policyProfile,
              blockingFailuresCount: latestGate.blockingFailuresCount,
              heldEvidenceCount: latestGate.heldEvidenceCount,
              unavailableEvidenceCount: latestGate.unavailableEvidenceCount,
            }
          : undefined,
      );
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
const finalPromotionGateSummaryAvailable = existsSync(finalPromotionGateSummaryPath);
const finalPromotionGateSummary = finalPromotionGateSummaryAvailable
  ? readFileSync(finalPromotionGateSummaryPath, 'utf8')
  : undefined;

const rendered = renderVerificationReport({
  generatedAt: new Date().toISOString(),
  phasePolicySummary,
  phasePolicyAvailable,
  capabilityScorecard,
  capabilityEvidenceSummary,
  capabilityEvidenceAvailable,
  promotionGateSummary,
  promotionGateSummaryAvailable: capabilityEvidenceAvailable,
  liveVerifySummary,
  liveVerifyAvailable,
  reviewPacket,
  reviewPacketAvailable,
  promotionDecisions,
  promotionDecisionsAvailable,
  finalPromotionGateSummary,
  finalPromotionGateSummaryAvailable,
});

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, rendered, 'utf8');
console.log(`Wrote ${outputPath}`);
