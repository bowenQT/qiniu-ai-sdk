export interface VerificationReportInput {
    generatedAt: string;
    phasePolicySummary?: string;
    phasePolicyAvailable?: boolean;
    capabilityScorecard: string;
    capabilityEvidenceSummary?: string;
    capabilityEvidenceAvailable?: boolean;
    promotionGateSummary?: string;
    promotionGateSummaryAvailable?: boolean;
    liveVerifySummary?: string;
    liveVerifyAvailable: boolean;
    reviewPacket?: string;
    reviewPacketAvailable?: boolean;
    promotionDecisions?: string;
    promotionDecisionsAvailable?: boolean;
}

export interface PromotionDecisionSummaryEntry {
    module: string;
    oldMaturity: string;
    newMaturity: string;
    trackedPath?: string;
    decisionSource?: string;
    decisionAt?: string;
}

export interface CloseoutPromotionGateSummaryEntry {
    status: 'pass' | 'held' | 'block' | 'unavailable';
    packageId?: string;
    policyProfile?: string;
    blockingFailuresCount?: number;
    heldEvidenceCount?: number;
    unavailableEvidenceCount?: number;
}

export interface CapabilityEvidenceSummaryInput {
    generatedAt?: string;
    decisionFiles?: string[];
    promotionDecisions?: PromotionDecisionSummaryEntry[];
    latestLiveVerifyGate?: {
        path?: string;
        status?: string;
        packageId?: string;
        policyProfile?: string;
        promotionGateStatus?: CloseoutPromotionGateSummaryEntry['status'];
        blockingFailuresCount?: number;
        heldEvidenceCount?: number;
        unavailableEvidenceCount?: number;
    };
}

export interface Phase2CloseoutModuleEntry {
    module: string;
    maturity: string;
    validationLevel?: string;
    decisionStatus: 'held' | 'promoted' | 'untracked';
    trackedPath?: string;
    decisionSource?: string;
    decisionAt?: string;
    deferredRisks?: string[];
}

export interface Phase2PlanningReadinessResult {
    ready: boolean;
    reasons: string[];
}

export interface Phase2CloseoutReportInput {
    generatedAt: string;
    phaseStatus: string;
    allowNewPackages: boolean;
    policyPath?: string;
    closeoutReportPath?: string;
    verificationReportPath?: string;
    closeoutCriteria?: string[];
    overrideRules?: string[];
    promotionGateStatus?: CloseoutPromotionGateSummaryEntry['status'];
    modules: Phase2CloseoutModuleEntry[];
    remainingDeferredRisks: string[];
    readiness: Phase2PlanningReadinessResult;
}

function trimEmbeddedHeading(content: string): string {
    const trimmed = content.trim();
    return trimmed.replace(/^# .+\n+/, '');
}

export function renderReviewPacketFallback(options?: {
    handoffPath?: string;
    handoffContent?: string;
}): string {
    const handoffContent = options?.handoffContent?.trim();
    if (handoffContent) {
        return handoffContent.endsWith('\n') ? handoffContent : `${handoffContent}\n`;
    }
    if (options?.handoffPath) {
        return [
            '# Review Packet',
            '',
            `Tracked review handoff: ${options.handoffPath}`,
            '',
        ].join('\n');
    }
    return [
        '# Review Packet',
        '',
        'No package-scoped review packet inputs were provided for this run.',
        '',
    ].join('\n');
}

export function renderPromotionDecisionSummary(
    decisions: PromotionDecisionSummaryEntry[],
): string {
    const lines = ['# Promotion Decisions', ''];
    if (decisions.length === 0) {
        lines.push('No promotion decisions recorded.', '');
        return lines.join('\n');
    }
    for (const decision of decisions) {
        lines.push(`## ${decision.module}`);
        lines.push('');
        lines.push(
            decision.oldMaturity === decision.newMaturity
                ? `- Maturity: ${decision.newMaturity} (held)`
                : `- Maturity: ${decision.oldMaturity} -> ${decision.newMaturity}`,
        );
        if (decision.decisionSource) {
            lines.push(`- Source: ${decision.decisionSource}`);
        }
        if (decision.decisionAt) {
            lines.push(`- Decision at: ${decision.decisionAt}`);
        }
        if (decision.trackedPath) {
            lines.push(`- Tracked file: ${decision.trackedPath}`);
        }
        lines.push('');
    }
    return lines.join('\n');
}

export function renderPromotionGateSummary(entry?: CloseoutPromotionGateSummaryEntry): string {
    if (!entry) {
        return [
            '# Promotion Gate Summary',
            '',
            'No live-verify promotion gate artifact was produced for this run.',
            '',
        ].join('\n');
    }
    return [
        '# Promotion Gate Summary',
        '',
        `- Status: ${entry.status}`,
        ...(entry.packageId ? [`- Package: ${entry.packageId}`] : []),
        ...(entry.policyProfile ? [`- Policy profile: ${entry.policyProfile}`] : []),
        `- Blocking failures: ${entry.blockingFailuresCount ?? 0}`,
        `- Held evidence: ${entry.heldEvidenceCount ?? 0}`,
        `- Unavailable evidence: ${entry.unavailableEvidenceCount ?? 0}`,
        '',
    ].join('\n');
}

export function renderCapabilityEvidenceSummary(snapshot: CapabilityEvidenceSummaryInput): string {
    const decisionFiles = Array.isArray(snapshot.decisionFiles) ? snapshot.decisionFiles : [];
    const promotionDecisions = Array.isArray(snapshot.promotionDecisions) ? snapshot.promotionDecisions : [];
    const latestGate = snapshot.latestLiveVerifyGate;
    return [
        '# Capability Evidence Snapshot',
        '',
        `Generated at: ${snapshot.generatedAt ?? 'unknown'}`,
        `Tracked decision files: ${decisionFiles.length}`,
        ...(decisionFiles.length > 0
            ? [
                '',
                'Decision files:',
                ...decisionFiles.map((filePath) => `- ${filePath}`),
            ]
            : []),
        '',
        `Tracked promotion decisions: ${promotionDecisions.length}`,
        ...(promotionDecisions.length > 0
            ? [
                '',
                'Decision records:',
                ...promotionDecisions.map((decision) => {
                    const maturity =
                        decision.oldMaturity === decision.newMaturity
                            ? `${decision.newMaturity} (held)`
                            : `${decision.oldMaturity} -> ${decision.newMaturity}`;
                    return `- ${decision.module}: ${maturity} [${decision.trackedPath ?? 'untracked'}]`;
                }),
            ]
            : []),
        ...(latestGate
            ? [
                '',
                'Latest gate artifact:',
                `- Path: ${latestGate.path ?? 'unknown'}`,
                `- Status: ${latestGate.status ?? 'unknown'}`,
                `- Promotion gate: ${latestGate.promotionGateStatus ?? 'unknown'}`,
                `- Blocking failures: ${latestGate.blockingFailuresCount ?? 0}`,
                `- Held evidence: ${latestGate.heldEvidenceCount ?? 0}`,
                `- Unavailable evidence: ${latestGate.unavailableEvidenceCount ?? 0}`,
                ...(latestGate.packageId ? [`- Package: ${latestGate.packageId}`] : []),
            ]
            : []),
        '',
    ].join('\n');
}

export function evaluatePhase2PlanningReadiness(options: {
    phaseStatus: string;
    allowNewPackages: boolean;
    promotionGateStatus?: CloseoutPromotionGateSummaryEntry['status'];
    modules: Phase2CloseoutModuleEntry[];
}): Phase2PlanningReadinessResult {
    const reasons: string[] = [];
    if (options.phaseStatus === 'active') {
        reasons.push('Phase 2 policy is still active.');
    }
    if (options.allowNewPackages) {
        reasons.push('Phase 2 policy still allows new packages.');
    }
    if (options.promotionGateStatus === 'block') {
        reasons.push('Latest promotion gate status is block.');
    }
    for (const entry of options.modules) {
        if (entry.decisionStatus === 'untracked') {
            reasons.push(`Missing tracked promotion decision for ${entry.module}.`);
        }
    }
    return {
        ready: reasons.length === 0,
        reasons,
    };
}

export function renderPhase2CloseoutReport(input: Phase2CloseoutReportInput): string {
    return [
        '# Phase 2 Closeout Report',
        '',
        `Generated at: ${input.generatedAt}`,
        '',
        'This artifact summarizes the tracked closeout state for Phase 2 so release owners and antigravity can decide whether the repository should stop opening Phase 2 packages and move to Phase 3 planning.',
        '',
        '## Phase Policy',
        '',
        `- Status: ${input.phaseStatus}`,
        `- New packages allowed: ${input.allowNewPackages ? 'yes' : 'no'}`,
        ...(input.policyPath ? [`- Policy path: ${input.policyPath}`] : []),
        ...(input.closeoutReportPath ? [`- Closeout report path: ${input.closeoutReportPath}`] : []),
        ...(input.verificationReportPath ? [`- Verification report path: ${input.verificationReportPath}`] : []),
        ...(input.closeoutCriteria && input.closeoutCriteria.length > 0
            ? [
                '',
                'Closeout criteria:',
                ...input.closeoutCriteria.map((criterion) => `- ${criterion}`),
            ]
            : []),
        ...(input.overrideRules && input.overrideRules.length > 0
            ? [
                '',
                'Override rules:',
                ...input.overrideRules.map((rule) => `- ${rule}`),
            ]
            : []),
        '',
        '## Promotion-sensitive Modules',
        '',
        ...(input.modules.length > 0
            ? input.modules.flatMap((entry) => [
                `### ${entry.module}`,
                '',
                `- Maturity: ${entry.maturity}`,
                `- Validation: ${entry.validationLevel ?? 'unknown'}`,
                `- Decision: ${entry.decisionStatus}`,
                ...(entry.decisionSource ? [`- Decision source: ${entry.decisionSource}`] : []),
                ...(entry.decisionAt ? [`- Decision at: ${entry.decisionAt}`] : []),
                ...(entry.trackedPath ? [`- Tracked decision: ${entry.trackedPath}`] : []),
                ...(entry.deferredRisks && entry.deferredRisks.length > 0
                    ? [
                        '- Deferred risks:',
                        ...entry.deferredRisks.map((risk) => `  - ${risk}`),
                    ]
                    : []),
                '',
            ])
            : ['No promotion-sensitive modules were identified for Phase 2.', '']),
        '## Remaining Deferred Risks',
        '',
        ...(input.remainingDeferredRisks.length > 0
            ? input.remainingDeferredRisks.map((risk) => `- ${risk}`)
            : ['- No remaining deferred risks recorded.']),
        '',
        '## Phase 3 Planning Readiness',
        '',
        `- Ready: ${input.readiness.ready ? 'yes' : 'no'}`,
        ...(input.promotionGateStatus ? [`- Latest promotion gate status: ${input.promotionGateStatus}`] : []),
        ...(input.readiness.reasons.length > 0
            ? [
                '',
                'Blocking reasons:',
                ...input.readiness.reasons.map((reason) => `- ${reason}`),
            ]
            : [
                '',
                'Blocking reasons:',
                '- None. Phase 2 is ready to move into Phase 3 planning.',
            ]),
        '',
    ].join('\n');
}

export function renderVerificationReport(input: VerificationReportInput): string {
    const capabilityScorecard = trimEmbeddedHeading(input.capabilityScorecard);
    const phasePolicySummary = input.phasePolicySummary ? trimEmbeddedHeading(input.phasePolicySummary) : undefined;
    const capabilityEvidenceSummary = input.capabilityEvidenceSummary
        ? trimEmbeddedHeading(input.capabilityEvidenceSummary)
        : undefined;
    const promotionGateSummary = input.promotionGateSummary
        ? trimEmbeddedHeading(input.promotionGateSummary)
        : undefined;
    const liveVerifySummary = input.liveVerifySummary ? trimEmbeddedHeading(input.liveVerifySummary) : undefined;
    const reviewPacket = input.reviewPacket ? trimEmbeddedHeading(input.reviewPacket) : undefined;
    const promotionDecisions = input.promotionDecisions
        ? trimEmbeddedHeading(input.promotionDecisions)
        : undefined;

    return [
        '# Verification Report',
        '',
        `Generated at: ${input.generatedAt}`,
        '',
        'This artifact combines tracked capability truth, package review artifacts, tracked promotion decisions, and the latest live verification evidence and policy boundaries produced in CI.',
        '',
        '## Phase Policy',
        '',
        input.phasePolicyAvailable && phasePolicySummary
            ? phasePolicySummary
            : 'Phase policy summary was not produced for this run.',
        '',
        '## Capability Scorecard',
        '',
        capabilityScorecard,
        '',
        '## Capability Evidence Snapshot',
        '',
        input.capabilityEvidenceAvailable && capabilityEvidenceSummary
            ? capabilityEvidenceSummary
            : 'Capability evidence snapshot was not produced for this run.',
        '',
        '## Promotion Gate Summary',
        '',
        input.promotionGateSummaryAvailable && promotionGateSummary
            ? promotionGateSummary
            : 'Promotion gate summary was not produced for this run.',
        '',
        '## Live Verification',
        '',
        input.liveVerifyAvailable && liveVerifySummary
            ? liveVerifySummary
            : 'Live verification artifact was not produced for this run.',
        '',
        '## Review Packet',
        '',
        input.reviewPacketAvailable && reviewPacket
            ? reviewPacket
            : 'Review packet artifact was not produced for this run.',
        '',
        '## Promotion Decisions',
        '',
        input.promotionDecisionsAvailable && promotionDecisions
            ? promotionDecisions
            : 'Promotion decision artifact was not produced for this run.',
        '',
    ].join('\n');
}
