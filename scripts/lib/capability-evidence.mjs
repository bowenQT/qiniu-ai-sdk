import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';

const LIVE_VERIFY_GATE_PROMOTION_STATUSES = new Set(['pass', 'held', 'block', 'unavailable']);

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
  const renderedLatestGate = snapshot.latestLiveVerifyGate == null
    ? 'null'
    : `${JSON.stringify(snapshot.latestLiveVerifyGate, null, 2)} as const`;
  return [
    "import type { ModuleMaturityInfo } from './capability-types';",
    '',
    `export const CAPABILITY_EVIDENCE_GENERATED_AT = ${JSON.stringify(snapshot.generatedAt)};`,
    `export const CAPABILITY_EVIDENCE_DECISION_FILES = ${JSON.stringify(snapshot.decisionFiles, null, 2)} as const;`,
    `export const LATEST_LIVE_VERIFY_GATE = ${renderedLatestGate};`,
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
        requirements: decision.requirements && typeof decision.requirements === 'object'
          ? decision.requirements
          : undefined,
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

function matchesLiveVerifyGateRequirement(requirement, latestLiveVerifyGate) {
  if (!requirement) return true;
  if (!latestLiveVerifyGate) return false;
  if (requirement.path && latestLiveVerifyGate.path !== requirement.path) return false;
  if (requirement.policyProfile && latestLiveVerifyGate.policyProfile !== requirement.policyProfile) return false;
  if (requirement.status && latestLiveVerifyGate.status !== requirement.status) return false;
  if (
    requirement.promotionGateStatus
    && latestLiveVerifyGate.promotionGateStatus !== requirement.promotionGateStatus
  ) {
    return false;
  }
  return true;
}

function isApplicablePromotionDecision(decision, latestLiveVerifyGate) {
  return matchesLiveVerifyGateRequirement(decision.requirements?.liveVerifyGate, latestLiveVerifyGate);
}

function buildLatestDecisionIndex(decisions, latestLiveVerifyGate) {
  const index = new Map();
  for (const decision of decisions) {
    if (!isApplicablePromotionDecision(decision, latestLiveVerifyGate)) continue;
    index.set(capabilityModuleKey(decision.module), decision);
  }
  return index;
}

export function summarizeLiveVerifyGateArtifact(gateArtifact, gatePath) {
  if (!gateArtifact || typeof gateArtifact !== 'object') {
    return undefined;
  }

  return {
    path: gatePath,
    generatedAt: gateArtifact.generatedAt,
    status: gateArtifact.status,
    exitCode: gateArtifact.exitCode,
    policyProfile: gateArtifact.policyProfile,
    packageId: gateArtifact.packageId,
    packageCategory: gateArtifact.packageCategory,
    promotionGateStatus: gateArtifact.promotionGateStatus,
    blockingFailuresCount: Array.isArray(gateArtifact.blockingFailures) ? gateArtifact.blockingFailures.length : 0,
    heldEvidenceCount: Array.isArray(gateArtifact.heldEvidence) ? gateArtifact.heldEvidence.length : 0,
    unavailableEvidenceCount: Array.isArray(gateArtifact.unavailableEvidence) ? gateArtifact.unavailableEvidence.length : 0,
  };
}

export function resolveCapabilityEvidenceGateArtifact(options) {
  const {
    gatePath,
    required = false,
    expectedPolicyProfile,
    maxAgeHours,
    now = () => Date.now(),
    fileExists = existsSync,
    readJsonFile = readJson,
  } = options ?? {};

  if (!gatePath) {
    if (required) {
      throw new Error('Capability evidence gate input path is required but was not provided.');
    }
    return undefined;
  }

  if (!fileExists(gatePath)) {
    if (required) {
      throw new Error(`Required live verify gate artifact not found: ${gatePath}`);
    }
    return undefined;
  }

  const artifact = readJsonFile(gatePath);
  if (!artifact || typeof artifact !== 'object') {
    throw new Error(`Invalid live verify gate artifact payload: ${gatePath}`);
  }

  if (typeof artifact.generatedAt !== 'string' || parseCapabilityEvidenceTime(artifact.generatedAt) === 0) {
    throw new Error(`Invalid live verify gate artifact generatedAt: ${gatePath}`);
  }

  if (typeof artifact.status !== 'string' || artifact.status.length === 0) {
    throw new Error(`Invalid live verify gate artifact status: ${gatePath}`);
  }

  if (
    artifact.promotionGateStatus != null
    && !LIVE_VERIFY_GATE_PROMOTION_STATUSES.has(artifact.promotionGateStatus)
  ) {
    throw new Error(`Invalid live verify gate artifact promotionGateStatus: ${gatePath}`);
  }

  if (expectedPolicyProfile && artifact.policyProfile !== expectedPolicyProfile) {
    throw new Error(
      `Live verify gate artifact policy profile mismatch for ${gatePath}: expected ${expectedPolicyProfile}, received ${artifact.policyProfile ?? 'unknown'}`,
    );
  }

  if (maxAgeHours != null) {
    if (typeof maxAgeHours !== 'number' || !Number.isFinite(maxAgeHours) || maxAgeHours < 0) {
      throw new Error(`Invalid maxAgeHours for capability evidence gate ingestion: ${maxAgeHours}`);
    }
    const ageMs = now() - parseCapabilityEvidenceTime(artifact.generatedAt);
    if (ageMs > maxAgeHours * 60 * 60 * 1000) {
      throw new Error(
        `Live verify gate artifact is stale: ${gatePath} (generatedAt ${artifact.generatedAt}, max age ${maxAgeHours}h)`,
      );
    }
  }

  return summarizeLiveVerifyGateArtifact(artifact, gatePath);
}

export function buildCapabilityEvidenceSnapshot(baseline, decisions, decisionFiles = [], latestLiveVerifyGate) {
  if (baseline.version !== 1 || !Array.isArray(baseline.modules)) {
    throw new Error('Invalid capability evidence baseline payload.');
  }

  const modules = baseline.modules.map((entry) => ({ ...entry }));
  const index = new Map(modules.map((entry, offset) => [capabilityModuleKey(entry.name), offset]));
  const latestDecisionIndex = buildLatestDecisionIndex(decisions, latestLiveVerifyGate);

  for (const decision of decisions) {
    if (!index.has(capabilityModuleKey(decision.module))) {
      throw new Error(`Tracked promotion decision references unknown module "${decision.module}"`);
    }
  }

  for (const [moduleKey, offset] of index.entries()) {
    const trackedDecision = latestDecisionIndex.get(moduleKey);
    if (!trackedDecision) continue;
    modules[offset] = {
      ...modules[offset],
      maturity: trackedDecision.newMaturity,
      trackedDecision,
    };
  }

  return {
    version: 1,
    generatedAt: computeCapabilityEvidenceGeneratedAt(modules, decisions),
    decisionFiles,
    latestLiveVerifyGate,
    modules,
    promotionDecisions: decisions,
  };
}
