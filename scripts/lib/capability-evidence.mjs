import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';

export function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

export function walkJsonFiles(root) {
  if (!existsSync(root)) return [];
  const results = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const entryPath = join(root, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkJsonFiles(entryPath));
      continue;
    }
    if (entry.isFile() && extname(entry.name) === '.json') {
      results.push(entryPath);
    }
  }
  return results.sort((a, b) => a.localeCompare(b));
}

export function parseCapabilityEvidenceTime(value) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function capabilityModuleKey(name) {
  return String(name).toLowerCase();
}

export function renderCapabilityEvidenceJson(payload) {
  return JSON.stringify(payload, null, 2) + '\n';
}

export function renderCapabilityEvidenceGeneratedModule(snapshot) {
  return [
    "import type { ModuleMaturityInfo } from './capability-types';",
    '',
    `export const CAPABILITY_EVIDENCE_GENERATED_AT = ${JSON.stringify(snapshot.generatedAt)};`,
    `export const CAPABILITY_EVIDENCE_DECISION_FILES = ${JSON.stringify(snapshot.decisionFiles, null, 2)} as const;`,
    `export const TRACKED_PROMOTION_DECISIONS = ${JSON.stringify(snapshot.promotionDecisions, null, 2)} as const;`,
    `export const MODULE_MATURITY_SOURCE: ModuleMaturityInfo[] = ${JSON.stringify(snapshot.modules, null, 2)};`,
    '',
  ].join('\n');
}

export function collectPromotionDecisions(files, { readJsonFile = readJson, relativeToRoot = (value) => value } = {}) {
  const decisions = [];
  for (const filePath of files) {
    const payload = readJsonFile(filePath);
    if (payload.version !== 1 || !Array.isArray(payload.decisions)) {
      throw new Error(`Invalid promotion decision file: ${filePath}`);
    }
    for (const decision of payload.decisions) {
      decisions.push({
        packageId: payload.packageId,
        module: decision.module,
        oldMaturity: decision.oldMaturity,
        newMaturity: decision.newMaturity,
        evidenceBasis: Array.isArray(decision.evidenceBasis) ? decision.evidenceBasis : [],
        decisionSource: decision.decisionSource,
        decisionAt: decision.decisionAt,
        trackedPath: relativeToRoot(filePath),
      });
    }
  }

  decisions.sort((left, right) =>
    parseCapabilityEvidenceTime(left.decisionAt) - parseCapabilityEvidenceTime(right.decisionAt)
      || left.module.localeCompare(right.module)
      || left.packageId.localeCompare(right.packageId),
  );

  return decisions;
}

export function computeCapabilityEvidenceGeneratedAt(modules, decisions) {
  const timestamps = [];
  for (const entry of modules) {
    timestamps.push(parseCapabilityEvidenceTime(entry.sourceUpdatedAt));
    timestamps.push(parseCapabilityEvidenceTime(entry.validatedAt));
  }
  for (const decision of decisions) {
    timestamps.push(parseCapabilityEvidenceTime(decision.decisionAt));
  }
  const latest = Math.max(0, ...timestamps);
  return latest > 0 ? new Date(latest).toISOString() : '1970-01-01T00:00:00.000Z';
}

export function buildCapabilityEvidenceSnapshot(baseline, decisions, decisionFiles = []) {
  if (baseline.version !== 1 || !Array.isArray(baseline.modules)) {
    throw new Error('Invalid capability evidence baseline payload.');
  }

  const modules = baseline.modules.map((entry) => ({ ...entry }));
  const index = new Map(modules.map((entry, offset) => [capabilityModuleKey(entry.name), offset]));

  for (const decision of decisions) {
    const offset = index.get(capabilityModuleKey(decision.module));
    if (typeof offset !== 'number') {
      throw new Error(`Tracked promotion decision references unknown module "${decision.module}"`);
    }
    modules[offset] = {
      ...modules[offset],
      maturity: decision.newMaturity,
    };
  }

  return {
    version: 1,
    generatedAt: computeCapabilityEvidenceGeneratedAt(modules, decisions),
    decisionFiles,
    modules,
    promotionDecisions: decisions,
  };
}
