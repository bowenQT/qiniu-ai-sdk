#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const phasePolicyPath = resolve(
  process.cwd(),
  process.env.QINIU_PHASE_POLICY_PATH || '.trellis/spec/sdk/phase-policy.json',
);
const liveVerifyPolicyPath = resolve(
  process.cwd(),
  process.env.QINIU_LIVE_VERIFY_POLICY_PATH || '.trellis/spec/sdk/live-verify-policy.json',
);
const capabilityEvidencePath = resolve(
  process.cwd(),
  process.env.QINIU_CAPABILITY_EVIDENCE_PATH || '.trellis/spec/sdk/capability-evidence.json',
);
const verificationReportPath = process.env.QINIU_VERIFICATION_REPORT_OUTPUT || 'artifacts/verification-report.md';
const outputPath = resolve(
  process.cwd(),
  process.env.QINIU_PHASE2_CLOSEOUT_REPORT_OUTPUT || 'artifacts/phase2-closeout-report.md',
);

const distEntry = resolve(repoRoot, 'dist', 'cli', 'verification-report.mjs');
if (!existsSync(distEntry)) {
  throw new Error(`Missing build artifact: ${distEntry}. Run "npm run build" before rendering the Phase 2 closeout report.`);
}

const {
  evaluatePhase2PlanningReadiness,
  renderPhase2CloseoutReport,
} = await import(pathToFileURL(distEntry).href);

const phasePolicy = JSON.parse(readFileSync(phasePolicyPath, 'utf8'));
const phase2 = phasePolicy?.phases?.phase2;
if (!phase2) {
  throw new Error(`Phase 2 policy entry was not found in ${phasePolicyPath}`);
}

const liveVerifyPolicy = JSON.parse(readFileSync(liveVerifyPolicyPath, 'utf8'));
const capabilityEvidence = JSON.parse(readFileSync(capabilityEvidencePath, 'utf8'));
const moduleIndex = new Map(
  Array.isArray(capabilityEvidence.modules)
    ? capabilityEvidence.modules.map((entry) => [entry.name, entry])
    : [],
);

const promotionModules = new Map();
for (const profile of Object.values(liveVerifyPolicy?.profiles ?? {})) {
  for (const lanePolicy of Object.values(profile?.lanePolicies ?? {})) {
    for (const moduleName of lanePolicy?.promotionModules ?? []) {
      const existing = promotionModules.get(moduleName) ?? {
        deferredRisks: new Set(),
      };
      for (const risk of lanePolicy?.deferredRisks ?? []) {
        existing.deferredRisks.add(risk);
      }
      promotionModules.set(moduleName, existing);
    }
  }
}

const modules = Array.from(promotionModules.entries())
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([moduleName, policyEntry]) => {
    const entry = moduleIndex.get(moduleName);
    const trackedDecision = entry?.trackedDecision;
    const decisionStatus = !trackedDecision
      ? 'untracked'
      : trackedDecision.oldMaturity === trackedDecision.newMaturity
        ? 'held'
        : 'promoted';
    return {
      module: moduleName,
      maturity: entry?.maturity ?? 'unknown',
      validationLevel: entry?.validationLevel,
      decisionStatus,
      trackedPath: trackedDecision?.trackedPath,
      decisionSource: trackedDecision?.decisionSource,
      decisionAt: trackedDecision?.decisionAt,
      deferredRisks: Array.from(policyEntry.deferredRisks).sort((left, right) => left.localeCompare(right)),
    };
  });

const remainingDeferredRisks = Array.from(
  new Set(modules.flatMap((entry) => entry.deferredRisks ?? [])),
).sort((left, right) => left.localeCompare(right));

const promotionGateStatus = capabilityEvidence?.latestLiveVerifyGate?.promotionGateStatus;
const readiness = evaluatePhase2PlanningReadiness({
  phaseStatus: phase2.status,
  allowNewPackages: phase2.allowNewPackages,
  promotionGateStatus,
  modules,
});

const rendered = renderPhase2CloseoutReport({
  generatedAt: new Date().toISOString(),
  phaseStatus: phase2.status ?? 'unknown',
  allowNewPackages: Boolean(phase2.allowNewPackages),
  policyPath: '.trellis/spec/sdk/phase-policy.json',
  closeoutReportPath: phase2.closeoutReportPath,
  verificationReportPath,
  closeoutCriteria: Array.isArray(phase2.closeoutCriteria) ? phase2.closeoutCriteria : [],
  overrideRules: Array.isArray(phase2.overrideRules) ? phase2.overrideRules : [],
  promotionGateStatus,
  modules,
  remainingDeferredRisks,
  readiness,
});

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, rendered, 'utf8');
console.log(`Wrote ${outputPath}`);
