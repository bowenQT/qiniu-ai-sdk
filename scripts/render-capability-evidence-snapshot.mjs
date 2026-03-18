#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildCapabilityEvidenceSnapshot,
  collectPromotionDecisions,
  readJson,
  renderCapabilityEvidenceGeneratedModule,
  resolveCapabilityEvidenceGateArtifact,
  renderCapabilityEvidenceJson,
  walkJsonFiles,
} from './lib/capability-evidence.mjs';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const baselinePath = resolve(repoRoot, '.trellis', 'spec', 'sdk', 'capability-evidence-baseline.json');
const decisionRoot = resolve(repoRoot, '.trellis', 'decisions');
const snapshotPath = resolve(repoRoot, '.trellis', 'spec', 'sdk', 'capability-evidence.json');
const generatedModulePath = resolve(repoRoot, 'src', 'lib', 'capability-evidence.generated.ts');
const checkMode = process.argv.includes('--check');

function parseBooleanEnv(name) {
  const value = process.env[name];
  if (!value) return false;
  return value === '1' || value.toLowerCase() === 'true';
}

function parseOptionalHoursEnv(name) {
  const value = process.env[name];
  if (!value) return undefined;
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid ${name}: ${value}`);
  }
  return parsed;
}

const liveVerifyGatePath = resolve(
  repoRoot,
  process.env.QINIU_CAPABILITY_EVIDENCE_GATE_INPUT
    || process.env.QINIU_LIVE_VERIFY_OUTPUT
    || 'artifacts/live-verify-gate.json',
);

const baseline = readJson(baselinePath);
const trackedDecisionFiles = walkJsonFiles(decisionRoot);
const decisionFiles = trackedDecisionFiles.map((filePath) => relative(repoRoot, filePath));
const decisions = collectPromotionDecisions(trackedDecisionFiles, {
  relativeToRoot: (filePath) => relative(repoRoot, filePath),
});
const latestLiveVerifyGate = resolveCapabilityEvidenceGateArtifact({
  gatePath: liveVerifyGatePath,
  required: parseBooleanEnv('QINIU_CAPABILITY_EVIDENCE_REQUIRE_GATE'),
  expectedPolicyProfile: process.env.QINIU_CAPABILITY_EVIDENCE_EXPECT_PROFILE || undefined,
  maxAgeHours: parseOptionalHoursEnv('QINIU_CAPABILITY_EVIDENCE_MAX_AGE_HOURS'),
  readJsonFile: readJson,
  fileExists: existsSync,
  now: () => Date.now(),
});
if (latestLiveVerifyGate) {
  latestLiveVerifyGate.path = relative(repoRoot, liveVerifyGatePath);
}
const snapshot = buildCapabilityEvidenceSnapshot(baseline, decisions, decisionFiles, latestLiveVerifyGate);
const renderedSnapshot = renderCapabilityEvidenceJson(snapshot);
const renderedModule = renderCapabilityEvidenceGeneratedModule(snapshot);

if (checkMode) {
  const existingSnapshot = existsSync(snapshotPath) ? readFileSync(snapshotPath, 'utf8') : '';
  const existingModule = existsSync(generatedModulePath) ? readFileSync(generatedModulePath, 'utf8') : '';
  if (existingSnapshot !== renderedSnapshot || existingModule !== renderedModule) {
    console.error('Capability evidence snapshot is stale. Run "node scripts/render-capability-evidence-snapshot.mjs".');
    process.exit(1);
  }
  console.log('capability evidence snapshot ok');
  process.exit(0);
}

mkdirSync(dirname(snapshotPath), { recursive: true });
mkdirSync(dirname(generatedModulePath), { recursive: true });
writeFileSync(snapshotPath, renderedSnapshot, 'utf8');
writeFileSync(generatedModulePath, renderedModule, 'utf8');
console.log(`Wrote ${snapshotPath}`);
console.log(`Wrote ${generatedModulePath}`);
