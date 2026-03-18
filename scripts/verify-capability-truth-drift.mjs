#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const distEntry = resolve(repoRoot, 'dist', 'cli', 'verification-report.mjs');
const capabilityEvidencePath = resolve(repoRoot, '.trellis', 'spec', 'sdk', 'capability-evidence.json');
const capabilityScorecardPath = resolve(repoRoot, 'docs', 'capability-scorecard.md');

if (!existsSync(distEntry)) {
  throw new Error(`Missing build artifact: ${distEntry}. Run "npm run build" before verifying truth drift.`);
}
if (!existsSync(capabilityEvidencePath)) {
  throw new Error(`Missing capability evidence snapshot: ${capabilityEvidencePath}`);
}
if (!existsSync(capabilityScorecardPath)) {
  throw new Error(`Missing capability scorecard: ${capabilityScorecardPath}`);
}

const {
  renderCapabilityEvidenceSummary,
  renderPromotionGateSummary,
  renderVerificationReport,
} = await import(pathToFileURL(distEntry).href);

const snapshot = JSON.parse(readFileSync(capabilityEvidencePath, 'utf8'));
const capabilityScorecard = readFileSync(capabilityScorecardPath, 'utf8');
const capabilityEvidenceSummary = renderCapabilityEvidenceSummary(snapshot);
const promotionGateSummary = renderPromotionGateSummary(
  snapshot?.latestLiveVerifyGate?.promotionGateStatus
    ? {
        status: snapshot.latestLiveVerifyGate.promotionGateStatus,
        packageId: snapshot.latestLiveVerifyGate.packageId,
        policyProfile: snapshot.latestLiveVerifyGate.policyProfile,
        blockingFailuresCount: snapshot.latestLiveVerifyGate.blockingFailuresCount,
        heldEvidenceCount: snapshot.latestLiveVerifyGate.heldEvidenceCount,
        unavailableEvidenceCount: snapshot.latestLiveVerifyGate.unavailableEvidenceCount,
      }
    : undefined,
);

const report = renderVerificationReport({
  generatedAt: 'truth-drift-check',
  capabilityScorecard,
  capabilityEvidenceSummary,
  capabilityEvidenceAvailable: true,
  promotionGateSummary,
  promotionGateSummaryAvailable: true,
  liveVerifyAvailable: false,
  reviewPacketAvailable: false,
  promotionDecisionsAvailable: false,
});

const expectedSections = [
  capabilityEvidenceSummary.trim().replace(/^# .+\n+/, ''),
  promotionGateSummary.trim().replace(/^# .+\n+/, ''),
];

for (const section of expectedSections) {
  if (!report.includes(section)) {
    throw new Error('Verification report drift detected: expected truth-derived section is missing from the rendered report.');
  }
}

console.log('capability truth drift ok');
