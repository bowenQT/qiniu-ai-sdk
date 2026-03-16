import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

export type PackageLane =
    | 'foundation'
    | 'cloud-surface'
    | 'runtime'
    | 'runtime-hardening'
    | 'node-integrations'
    | 'dx-validation';
export type ChangePackageCategory = 'standard' | 'promotion-sensitive';
export type PackageDecisionMaturity = 'ga' | 'beta' | 'experimental';
export type PhasePolicyStatus = 'planning' | 'active' | 'frozen' | 'closed';

const PACKAGE_LANES: PackageLane[] = [
    'foundation',
    'cloud-surface',
    'runtime',
    'runtime-hardening',
    'node-integrations',
    'dx-validation',
];
const CHANGE_PACKAGE_CATEGORIES: ChangePackageCategory[] = ['standard', 'promotion-sensitive'];

export const DEFAULT_PHASE = 'phase2';
export const DEFAULT_PHASE_POLICY_PATH = '.trellis/spec/sdk/phase-policy.json';
export const DEFAULT_REQUIRED_EVIDENCE = [
    'focused-verification',
    'full-gate-status',
    'live-verify-delta',
    'deferred-risks',
];

export interface ChangePackage {
    version: 1;
    packageId: string;
    phase: string;
    ownerLane: PackageLane;
    category?: ChangePackageCategory;
    topic: string;
    goal: string;
    successCriteria: string[];
    touchedSurfaces: string[];
    requiredEvidence: string[];
    explicitlyOutOfScope: string[];
    expectedMergeTarget: string;
    expectedBranch: string;
    branch: string;
    worktreePath: string;
    createdAt: string;
}

export interface EvidenceBundle {
    version: 1;
    packageId: string;
    ownerLane: PackageLane;
    generatedAt: string;
    changedFiles: string[];
    changedSurfaces: string[];
    focusedVerification: string[];
    fullGateStatus: string[];
    liveVerifyDelta: string[];
    deferredRisks: string[];
    artifactLinks: string[];
}

export interface ReviewPacket {
    version: 1;
    packageId: string;
    generatedAt: string;
    briefSummary: string;
    successCriteria: string[];
    touchedSurfaces: string[];
    changedFiles: string[];
    focusedVerification: string[];
    fullGateStatus: string[];
    liveVerifyDelta: string[];
    deferredRisks: string[];
    artifactLinks: string[];
}

export interface PromotionDecisionRecord {
    module: string;
    oldMaturity: PackageDecisionMaturity;
    newMaturity: PackageDecisionMaturity;
    evidenceBasis: string[];
    decisionSource: string;
    decisionAt: string;
}

export interface PromotionDecisionSet {
    version: 1;
    packageId: string;
    generatedAt: string;
    decisions: PromotionDecisionRecord[];
}

export interface PhasePolicyEntry {
    status: PhasePolicyStatus;
    allowNewPackages: boolean;
    entryCriteria: string[];
    exitCriteria: string[];
    freezeTriggers: string[];
    promotionTriggers: string[];
    deferredToNextPhaseRules: string[];
}

export interface PhasePolicy {
    version: 1;
    phases: Record<string, PhasePolicyEntry>;
}

export interface CreateChangePackageOptions {
    phase?: string;
    ownerLane: PackageLane;
    category?: ChangePackageCategory;
    topic: string;
    goal: string;
    successCriteria: string[];
    touchedSurfaces?: string[];
    requiredEvidence?: string[];
    explicitlyOutOfScope?: string[];
    expectedMergeTarget?: string;
    expectedBranch?: string;
    branch?: string;
    worktreePath?: string;
    createdAt?: string;
}

export interface CreateEvidenceBundleOptions {
    changePackage: ChangePackage;
    changedFiles?: string[];
    changedSurfaces?: string[];
    focusedVerification?: string[];
    fullGateStatus?: string[];
    liveVerifyDelta?: string[];
    deferredRisks?: string[];
    artifactLinks?: string[];
    generatedAt?: string;
}

export function isPackageLane(value: string): value is PackageLane {
    return PACKAGE_LANES.includes(value as PackageLane);
}

export function isChangePackageCategory(value: string): value is ChangePackageCategory {
    return CHANGE_PACKAGE_CATEGORIES.includes(value as ChangePackageCategory);
}

export function parsePackageLane(value: string): PackageLane {
    if (!isPackageLane(value)) {
        throw new Error(`Unknown package lane: ${value}`);
    }
    return value;
}

export function parseChangePackageCategory(value: string): ChangePackageCategory {
    if (!isChangePackageCategory(value)) {
        throw new Error(`Unknown package category: ${value}`);
    }
    return value;
}

export function slugifyPackageTopic(value: string): string {
    const normalized = value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '');

    if (!normalized) {
        throw new Error(`Invalid package topic "${value}"`);
    }

    return normalized;
}

export function createPackageId(phase: string, ownerLane: PackageLane, topic: string): string {
    return `${phase}/${ownerLane}/${slugifyPackageTopic(topic)}`;
}

export function branchNameForPackage(phase: string, ownerLane: PackageLane, topic: string): string {
    return `codex/${phase}/${ownerLane}/${slugifyPackageTopic(topic)}`;
}

export function packageIdToFileStem(packageId: string): string {
    return packageId.replace(/[\\/]+/g, '-');
}

export function readJsonFile<T>(filePath: string): T {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

export function writeJsonFile(filePath: string, payload: unknown): string {
    const resolved = path.resolve(filePath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, JSON.stringify(payload, null, 2) + '\n', 'utf8');
    return resolved;
}

export function writeTextFile(filePath: string, payload: string): string {
    const resolved = path.resolve(filePath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, payload, 'utf8');
    return resolved;
}

export function readPhasePolicy(policyPath: string): PhasePolicy {
    const payload = readJsonFile<PhasePolicy>(policyPath);
    if (payload.version !== 1 || !payload.phases) {
        throw new Error(`Invalid phase policy file: ${policyPath}`);
    }
    return payload;
}

export function assertPhaseAllowsNewPackages(policy: PhasePolicy, phase: string): PhasePolicyEntry {
    const entry = policy.phases[phase];
    if (!entry) {
        throw new Error(`Phase policy does not define "${phase}"`);
    }
    if (!entry.allowNewPackages || entry.status === 'frozen' || entry.status === 'closed') {
        throw new Error(`Phase "${phase}" is ${entry.status} and does not allow new change packages.`);
    }
    return entry;
}

function currentBranch(cwd: string): string {
    const result = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
        cwd,
        encoding: 'utf8',
    });
    if (result.status !== 0) {
        return 'unknown';
    }
    return result.stdout.trim() || 'unknown';
}

export function defaultChangePackagePath(repoRoot: string, pkg: ChangePackage): string {
    return path.join(repoRoot, '.trellis', 'packages', pkg.phase, `${pkg.ownerLane}-${pkg.topic}.json`);
}

export function defaultEvidenceBundlePath(repoRoot: string, packageId: string): string {
    return path.join(repoRoot, 'artifacts', `${packageIdToFileStem(packageId)}-evidence.json`);
}

export function defaultReviewPacketPath(repoRoot: string, packageId: string): string {
    return path.join(repoRoot, 'artifacts', `${packageIdToFileStem(packageId)}-review-packet.md`);
}

export function defaultPromotionDecisionJsonPath(repoRoot: string, packageId: string): string {
    return path.join(repoRoot, 'artifacts', `${packageIdToFileStem(packageId)}-promotion-decisions.json`);
}

export function defaultPromotionDecisionMarkdownPath(repoRoot: string, packageId: string): string {
    return path.join(repoRoot, 'artifacts', `${packageIdToFileStem(packageId)}-promotion-decisions.md`);
}

export function defaultTrackedPromotionDecisionPath(repoRoot: string, packageId: string): string {
    const [phase] = packageId.split('/');
    return path.join(repoRoot, '.trellis', 'decisions', phase, `${packageIdToFileStem(packageId)}.json`);
}

export function createChangePackage(options: CreateChangePackageOptions): ChangePackage {
    if (options.successCriteria.length === 0) {
        throw new Error('Change package requires at least one success criterion.');
    }

    const phase = options.phase ?? DEFAULT_PHASE;
    const topic = slugifyPackageTopic(options.topic);
    const expectedBranch = options.expectedBranch ?? branchNameForPackage(phase, options.ownerLane, topic);
    return {
        version: 1,
        packageId: createPackageId(phase, options.ownerLane, topic),
        phase,
        ownerLane: options.ownerLane,
        category: options.category ?? 'standard',
        topic,
        goal: options.goal,
        successCriteria: options.successCriteria,
        touchedSurfaces: options.touchedSurfaces ?? [],
        requiredEvidence: options.requiredEvidence?.length
            ? options.requiredEvidence
            : [...DEFAULT_REQUIRED_EVIDENCE],
        explicitlyOutOfScope: options.explicitlyOutOfScope ?? [],
        expectedMergeTarget: options.expectedMergeTarget ?? 'main',
        expectedBranch,
        branch: options.branch ?? 'unknown',
        worktreePath: options.worktreePath ?? process.cwd(),
        createdAt: options.createdAt ?? new Date().toISOString(),
    };
}

export function createEvidenceBundle(options: CreateEvidenceBundleOptions): EvidenceBundle {
    return {
        version: 1,
        packageId: options.changePackage.packageId,
        ownerLane: options.changePackage.ownerLane,
        generatedAt: options.generatedAt ?? new Date().toISOString(),
        changedFiles: options.changedFiles ?? [],
        changedSurfaces: options.changedSurfaces?.length
            ? options.changedSurfaces
            : [...options.changePackage.touchedSurfaces],
        focusedVerification: options.focusedVerification ?? [],
        fullGateStatus: options.fullGateStatus ?? [],
        liveVerifyDelta: options.liveVerifyDelta ?? [],
        deferredRisks: options.deferredRisks ?? [],
        artifactLinks: options.artifactLinks ?? [],
    };
}

export function createReviewPacket(changePackage: ChangePackage, evidence: EvidenceBundle): ReviewPacket {
    if (changePackage.packageId !== evidence.packageId) {
        throw new Error(
            `Review packet inputs do not match: "${changePackage.packageId}" vs "${evidence.packageId}"`,
        );
    }

    return {
        version: 1,
        packageId: changePackage.packageId,
        generatedAt: evidence.generatedAt,
        briefSummary: changePackage.goal,
        successCriteria: changePackage.successCriteria,
        touchedSurfaces: evidence.changedSurfaces,
        changedFiles: evidence.changedFiles,
        focusedVerification: evidence.focusedVerification,
        fullGateStatus: evidence.fullGateStatus,
        liveVerifyDelta: evidence.liveVerifyDelta,
        deferredRisks: evidence.deferredRisks,
        artifactLinks: evidence.artifactLinks,
    };
}

export function upsertPromotionDecision(
    set: PromotionDecisionSet | undefined,
    changePackage: ChangePackage,
    record: PromotionDecisionRecord,
): PromotionDecisionSet {
    const existing = set ?? {
        version: 1 as const,
        packageId: changePackage.packageId,
        generatedAt: new Date().toISOString(),
        decisions: [],
    };

    if (existing.packageId !== changePackage.packageId) {
        throw new Error(
            `Promotion decision set "${existing.packageId}" does not match package "${changePackage.packageId}"`,
        );
    }

    const decisions = existing.decisions.filter((entry) => entry.module !== record.module);
    decisions.push(record);
    decisions.sort((a, b) => a.module.localeCompare(b.module));

    return {
        version: 1,
        packageId: existing.packageId,
        generatedAt: new Date().toISOString(),
        decisions,
    };
}

function renderListSection(title: string, items: string[], fallback: string): string {
    return [
        `## ${title}`,
        '',
        items.length > 0 ? items.map((item) => `- ${item}`).join('\n') : fallback,
        '',
    ].join('\n');
}

export function renderReviewPacketMarkdown(changePackage: ChangePackage, packet: ReviewPacket): string {
    return [
        '# Review Packet',
        '',
        `Package: \`${changePackage.packageId}\``,
        `Generated at: ${packet.generatedAt}`,
        `Owner lane: ${changePackage.ownerLane}`,
        `Expected branch: ${changePackage.expectedBranch}`,
        `Recorded branch: ${changePackage.branch}`,
        `Expected merge target: ${changePackage.expectedMergeTarget}`,
        '',
        '## Brief Summary',
        '',
        packet.briefSummary,
        '',
        renderListSection('Success Criteria', packet.successCriteria, 'No success criteria recorded.'),
        renderListSection('Touched Surfaces', packet.touchedSurfaces, 'No surfaces recorded.'),
        renderListSection('Changed Files', packet.changedFiles, 'No changed files recorded.'),
        renderListSection('Focused Verification', packet.focusedVerification, 'No focused verification recorded.'),
        renderListSection('Full Gate Status', packet.fullGateStatus, 'No full gate status recorded.'),
        renderListSection('Live Verify Delta', packet.liveVerifyDelta, 'No live verify delta recorded.'),
        renderListSection('Deferred Risks', packet.deferredRisks, 'No deferred risks recorded.'),
        renderListSection('Artifact Links', packet.artifactLinks, 'No artifact links recorded.'),
    ].join('\n');
}

export function renderPromotionDecisionMarkdown(set: PromotionDecisionSet): string {
    const body = set.decisions.length > 0
        ? set.decisions
            .map((decision) => [
                `### ${decision.module}`,
                '',
                decision.oldMaturity === decision.newMaturity
                    ? `- Maturity: ${decision.newMaturity} (held)`
                    : `- Maturity: ${decision.oldMaturity} -> ${decision.newMaturity}`,
                `- Source: ${decision.decisionSource}`,
                `- Decision at: ${decision.decisionAt}`,
                `- Evidence: ${decision.evidenceBasis.join('; ')}`,
                '',
            ].join('\n'))
            .join('')
        : 'No promotion decisions recorded.\n';

    return [
        '# Promotion Decisions',
        '',
        `Package: \`${set.packageId}\``,
        `Generated at: ${set.generatedAt}`,
        '',
        body,
    ].join('\n');
}

export function resolveCurrentBranch(cwd: string): string {
    return currentBranch(cwd);
}
