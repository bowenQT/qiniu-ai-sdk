#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildCapabilityEvidenceSnapshot,
  collectPromotionDecisions,
  readJson,
  renderCapabilityEvidenceGeneratedModule,
  renderCapabilityEvidenceJson,
  walkJsonFiles,
} from './lib/capability-evidence.mjs';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const baselinePath = resolve(repoRoot, '.trellis', 'spec', 'sdk', 'capability-evidence-baseline.json');
const decisionRoot = resolve(repoRoot, '.trellis', 'decisions');
const snapshotPath = resolve(repoRoot, '.trellis', 'spec', 'sdk', 'capability-evidence.json');
const generatedModulePath = resolve(repoRoot, 'src', 'lib', 'capability-evidence.generated.ts');
const checkMode = process.argv.includes('--check');

const baseline = readJson(baselinePath);
const trackedDecisionFiles = walkJsonFiles(decisionRoot);
const decisionFiles = trackedDecisionFiles.map((filePath) => relative(repoRoot, filePath));
const decisions = collectPromotionDecisions(trackedDecisionFiles, {
  relativeToRoot: (filePath) => relative(repoRoot, filePath),
});
const snapshot = buildCapabilityEvidenceSnapshot(baseline, decisions, decisionFiles);
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
